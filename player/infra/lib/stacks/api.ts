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
    singlePuzzle.addMethod("PATCH", puzzleIntegration);
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

    const attemptsHandler = new lambda.Function(this, "AttemptsHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/attempts.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        SECRET_ARN: props.cluster.secret!.secretArn,
        DATABASE_NAME: props.databaseName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    props.cluster.secret!.grantRead(attemptsHandler);
    props.cluster.grantDataApiAccess(attemptsHandler);

    const profileHandler = new lambda.Function(this, "ProfileHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/profile.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        SECRET_ARN: props.cluster.secret!.secretArn,
        DATABASE_NAME: props.databaseName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    props.cluster.secret!.grantRead(profileHandler);
    props.cluster.grantDataApiAccess(profileHandler);

    const profile = api.root.addResource("profile");
    profile.addMethod("GET", new apigw.LambdaIntegration(profileHandler));

    const attempts = api.root.addResource("attempts");
    const attemptIntegration = new apigw.LambdaIntegration(attemptsHandler);
    attempts.addMethod("GET", attemptIntegration);
    attempts.addMethod("POST", attemptIntegration);

    const singleAttempt = attempts.addResource("{id}");
    const attemptSubResource = singleAttempt.addResource("{proxy}");
    attemptSubResource.addMethod("GET", attemptIntegration);
    attemptSubResource.addMethod("POST", attemptIntegration);

    // Parser Lambda — container-based with Function URL (bypasses APIGW 29s timeout)
    const parserHandler = new lambda.DockerImageFunction(this, "OcrParserHandler", {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, "../../../../"),
        { file: "parsers/Dockerfile" }
      ),
      timeout: cdk.Duration.minutes(2),
      memorySize: 2048,
      environment: {
        GEMINI_API_KEY: this.node.tryGetContext("geminiApiKey") ?? "",
      },
    });

    const parserUrl = parserHandler.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ["Content-Type"],
      },
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
    });

    new cdk.CfnOutput(this, "ParserUrl", {
      value: parserUrl.url,
    });
  }
}
