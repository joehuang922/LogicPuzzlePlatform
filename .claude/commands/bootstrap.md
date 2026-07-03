Deploy the admin bootstrap CDK stack (OIDC provider + IAM deploy role) to AWS using the "personal" profile.

IMPORTANT: All AWS/CDK commands MUST be prefixed with:
```
AWS_CA_BUNDLE=~/.aws/nskp_config/netskope-cert-bundle.pem NODE_EXTRA_CA_CERTS=~/.aws/nskp_config/netskope-cert-bundle.pem
```
This overrides the global Netskope-only cert with the combined bundle needed for SSL verification.

Follow these steps in order:

1. Check if the bootstrap stack has been initialized by looking for `player/infra/bootstrap/node_modules/`. If it does NOT exist, run:
   ```
   cd player/infra/bootstrap && npm install
   ```
   Then check if CDK has been bootstrapped in the account by running:
   ```
   npx cdk bootstrap --profile personal
   ```
   from the `player/infra/bootstrap/` directory.

2. Run a diff to preview what will change:
   ```
   npx cdk diff --profile personal
   ```
   from `player/infra/bootstrap/`. Show the user the full diff output and ask for approval before proceeding.

3. Only after the user approves, run the deploy:
   ```
   npx cdk deploy --profile personal
   ```
   from `player/infra/bootstrap/`.

4. After deploy completes, show the user the stack outputs (especially the DeployRoleArn) and remind them to update the GitHub repo secret `AWS_ROLE_ARN` if the ARN changed.

IMPORTANT: All AWS/CDK commands MUST use `--profile personal`.
