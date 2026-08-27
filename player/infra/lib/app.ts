import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "./stacks/database";
import { AssetsStack } from "./stacks/assets";
import { ApiStack } from "./stacks/api";
import { FrontendStack } from "./stacks/frontend";

const app = new cdk.App();

const database = new DatabaseStack(app, "PuzzleDatabaseStack");

const assets = new AssetsStack(app, "PuzzleAssetsStack");

new ApiStack(app, "PuzzleApiStack", {
  cluster: database.cluster,
  databaseName: database.databaseName,
  assetsBucket: assets.bucket,
  assetsDistribution: assets.distribution,
});

new FrontendStack(app, "PuzzleFrontendStack");
