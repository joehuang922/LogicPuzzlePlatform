import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

const GITHUB_REPO = "joehuang922/LogicPuzzlePlatform";

class BootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidc",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    );

    const deployRole = new iam.Role(this, "DeployRole", {
      roleName: "PuzzlePlatformDeployRole",
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${GITHUB_REPO}:ref:refs/heads/main`,
          },
        }
      ),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudFormation",
        effect: iam.Effect.ALLOW,
        actions: ["cloudformation:*"],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "S3",
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudFront",
        effect: iam.Effect.ALLOW,
        actions: ["cloudfront:*"],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "Lambda",
        effect: iam.Effect.ALLOW,
        actions: ["lambda:*"],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ApiGateway",
        effect: iam.Effect.ALLOW,
        actions: ["apigateway:*"],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "RDS",
        effect: iam.Effect.ALLOW,
        actions: ["rds:*"],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "IAM",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:PassRole",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateRole",
          "iam:CreateServiceLinkedRole",
        ],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "EC2Vpc",
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateVpc",
          "ec2:DeleteVpc",
          "ec2:DescribeVpcs",
          "ec2:ModifyVpcAttribute",
          "ec2:CreateSubnet",
          "ec2:DeleteSubnet",
          "ec2:DescribeSubnets",
          "ec2:CreateRouteTable",
          "ec2:DeleteRouteTable",
          "ec2:AssociateRouteTable",
          "ec2:DisassociateRouteTable",
          "ec2:DescribeRouteTables",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
          "ec2:CreateInternetGateway",
          "ec2:DeleteInternetGateway",
          "ec2:AttachInternetGateway",
          "ec2:DetachInternetGateway",
          "ec2:DescribeInternetGateways",
          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:DescribeSecurityGroups",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeNetworkInterfaces",
        ],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SecretsManager",
        effect: iam.Effect.ALLOW,
        actions: [
          "secretsmanager:CreateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:TagResource",
          "secretsmanager:GetRandomPassword",
        ],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SSM",
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
        ],
        resources: ["*"],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "STS",
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/cdk-*"],
      })
    );

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: deployRole.roleArn,
      description:
        "Add this as AWS_ROLE_ARN secret in GitHub repo settings",
    });
  }
}

const app = new cdk.App();
new BootstrapStack(app, "PuzzlePlatformBootstrapStack");
