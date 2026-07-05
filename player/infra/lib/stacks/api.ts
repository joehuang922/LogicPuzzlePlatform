import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as rds from "aws-cdk-lib/aws-rds";
import * as path from "path";
import { Construct } from "constructs";

interface ApiStackProps extends cdk.StackProps {
  cluster: rds.DatabaseCluster;
  databaseName: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const puzzlesHandler = new lambda.Function(this, "PuzzlesHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/puzzles.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        SECRET_ARN: props.cluster.secret!.secretArn,
        DATABASE_NAME: props.databaseName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    props.cluster.secret!.grantRead(puzzlesHandler);
    props.cluster.grantDataApiAccess(puzzlesHandler);

    const collectionsHandler = new lambda.Function(this, "CollectionsHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/collections.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        SECRET_ARN: props.cluster.secret!.secretArn,
        DATABASE_NAME: props.databaseName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    props.cluster.secret!.grantRead(collectionsHandler);
    props.cluster.grantDataApiAccess(collectionsHandler);

    const api = new apigw.RestApi(this, "PuzzleApi", {
      restApiName: "Puzzle Platform API",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // Ensure 5xx/4xx Gateway errors include CORS headers so the browser can read them
    api.addGatewayResponse("GatewayDefault5xx", {
      type: apigw.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
      },
    });
    api.addGatewayResponse("GatewayDefault4xx", {
      type: apigw.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
      },
    });

    const puzzles = api.root.addResource("puzzles");
    const puzzleIntegration = new apigw.LambdaIntegration(puzzlesHandler);
    puzzles.addMethod("GET", puzzleIntegration);
    puzzles.addMethod("POST", puzzleIntegration);

    const singlePuzzle = puzzles.addResource("{id}");
    singlePuzzle.addMethod("GET", puzzleIntegration);
    singlePuzzle.addMethod("DELETE", puzzleIntegration);

    const collections = api.root.addResource("collections");
    const collectionIntegration = new apigw.LambdaIntegration(collectionsHandler);
    collections.addMethod("GET", collectionIntegration);
    collections.addMethod("POST", collectionIntegration);

    const puzzleTypesHandler = new lambda.Function(this, "PuzzleTypesHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/puzzle-types.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        SECRET_ARN: props.cluster.secret!.secretArn,
        DATABASE_NAME: props.databaseName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    props.cluster.secret!.grantRead(puzzleTypesHandler);
    props.cluster.grantDataApiAccess(puzzleTypesHandler);

    const puzzleTypes = api.root.addResource("puzzle-types");
    puzzleTypes.addMethod("GET", new apigw.LambdaIntegration(puzzleTypesHandler));

    const parserHandler = new lambda.Function(this, "GeminiParserHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/parse.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      environment: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
      },
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
    });

    const parse = api.root.addResource("parse");
    parse.addMethod("POST", new apigw.LambdaIntegration(parserHandler));

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
    });
  }
}
