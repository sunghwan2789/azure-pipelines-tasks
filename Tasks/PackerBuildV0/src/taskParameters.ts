"use strict";

import * as path from "path";
import * as tl from "vsts-task-lib/task";
import * as constants from "./constants";
import * as utils from "./utilities";
import msRestAzure = require("azure-arm-rest/azure-arm-common");
import AzureRMEndpoint = require("azure-arm-rest/azure-arm-endpoint");

export default class TaskParameters {
    public templateType: string;
    public customTemplateLocation: string;
    public serviceEndpoint: string;

    public resourceGroup: string;
    public location: string;
    public storageAccount: string;

    public baseImageSource: string;
    public builtinBaseImage: string;
    public customBaseImageUrl: string;
    public imagePublisher: string;
    public imageOffer: string;
    public imageSku: string;
    public osType: string;

    public packagePath: string;
    public deployScriptPath: string;
    public deployScriptArguments: string;

    public additionalBuilderParameters: {};
    public customTemplateParameters: {};
    public skipTempFileCleanupDuringVMDeprovision: boolean = true;

    public imageUri: string;

    public graphCredentials: Promise<msRestAzure.ApplicationTokenCredentials>;

    constructor() {
        try {
            this.templateType = tl.getInput(constants.TemplateTypeInputName, true);

            if(this.templateType === constants.TemplateTypeCustom) {
                this.customTemplateLocation = tl.getPathInput(constants.CustomTemplateLocationInputType, true, true);
                console.log(tl.loc("ParsingCustomTemplateParameters"));
                this.customTemplateParameters = JSON.parse(tl.getInput("customTemplateParameters"));
            } else {
                this.serviceEndpoint = tl.getInput(constants.ConnectedServiceInputName, true);
                this.resourceGroup = tl.getInput(constants.ResourceGroupInputName, true);
                this.storageAccount = tl.getInput(constants.StorageAccountInputName, true);
                this.location = tl.getInput(constants.LocationInputName, true);

                this.baseImageSource = tl.getInput(constants.BaseImageSourceInputName, true);
                if(this.baseImageSource === constants.BaseImageSourceCustomVhd) {
                    this.customBaseImageUrl = tl.getInput(constants.CustomImageUrlInputName, true);
                    this.osType = tl.getInput(constants.CustomImageOsTypeInputName, true);
                } else {
                    this.builtinBaseImage = tl.getInput(constants.BuiltinBaseImageInputName, true);
                    this._extractImageDetails();
                }

                console.log(tl.loc("ResolvingDeployPackageInput"));
                this.packagePath = this._getResolvedPath(tl.getVariable('System.DefaultWorkingDirectory'), tl.getInput(constants.DeployPackageInputName, true));
                console.log(tl.loc("ResolvedDeployPackgePath", this.packagePath));

                console.log(tl.loc("ResolvingDeployScriptInput"));
                var deployScriptAbsolutePath = this._getResolvedPath(this.packagePath, tl.getInput(constants.DeployScriptPathInputName, true));
                var scriptRelativePath = path.relative(this.packagePath, deployScriptAbsolutePath);
                this.deployScriptPath = this._normalizeRelativePathForTargetOS(scriptRelativePath);
                console.log(tl.loc("ResolvedDeployScriptPath", this.deployScriptPath));

                this.deployScriptArguments = tl.getInput(constants.DeployScriptArgumentsInputName, false);

                this.graphCredentials = this.getGraphCredentials(this.serviceEndpoint);
            }

            console.log(tl.loc("ParsingAdditionalBuilderParameters"));
            this.additionalBuilderParameters = JSON.parse(tl.getInput("additionalBuilderParameters"));
            this.skipTempFileCleanupDuringVMDeprovision = tl.getBoolInput("skipTempFileCleanupDuringVMDeprovision", false);
            this.imageUri = tl.getInput(constants.OutputVariableImageUri, false);
        }
        catch (error) {
            throw (tl.loc("TaskParametersConstructorFailed", error));
        }
    }

    // extract image details from base image e.g. "MicrosoftWindowsServer:WindowsServer:2012-R2-Datacenter:windows"
    private _extractImageDetails() {
        var parts = this.builtinBaseImage.split(':');
        this.imagePublisher = parts[0];
        this.imageOffer = parts[1];
        this.imageSku = parts[2];
        this.osType = parts[3];
    }

    private _getResolvedPath(rootFolder: string, inputPath: string) {
        var matchingFiles = utils.findMatch(rootFolder, inputPath);
        if(!utils.HasItems(matchingFiles)) {
            throw tl.loc("ResolvedPathNotFound", inputPath, rootFolder);
        }

        return matchingFiles[0];
    }

    private _normalizeRelativePathForTargetOS(inputPath: string) {
        if(tl.osType().match(/^Win/) && !this.osType.toLowerCase().match(/^win/)) {
            var splitPath = inputPath.split(path.sep);
            return path.posix.join.apply(null, splitPath);
        } else if(!tl.osType().match(/^Win/) && this.osType.toLocaleLowerCase().match(/^win/)) {
            var splitPath = inputPath.split(path.sep);
            return path.win32.join.apply(null, splitPath);
        }

        return inputPath;
    }

    private async getGraphCredentials(connectedService: string): Promise<msRestAzure.ApplicationTokenCredentials> {
        var azureEndpoint = await new AzureRMEndpoint(connectedService).getEndpoint(true);
        return azureEndpoint.applicationTokenCredentials;
    }
}