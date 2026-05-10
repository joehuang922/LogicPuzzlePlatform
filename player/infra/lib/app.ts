import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "./stacks/database";
import { ApiStack } from "./stacks/api";
import { FrontendStack } from "./stacks/frontend";

const app = new cdk.App();

const database = new DatabaseStack(app, "PuzzleDatabaseStack");

new ApiStack(app, "PuzzleApiStack", {
  cluster: database.cluster,
  databaseName: database.databaseName,
});

new FrontendStack(app, "PuzzleFrontendStack");
