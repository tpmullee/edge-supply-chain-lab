# Staging deployment

This template creates a **new** ETA v1 staging API and Lambda. It does not change the existing SCV `/eta` function or API Gateway route.

## Why isolated staging

The current patmullee.com source hard-codes one SCV API base URL, so both portfolio staging and production currently use the same backend. Updating that Lambda in place would expose an unreviewed model to production.

The safe path is:

1. build v1 reproducibly;
2. package the lean Lambda runtime;
3. deploy the separate staging stack;
4. set the portfolio staging build's `REACT_APP_SCV_API_BASE` to the stack output;
5. test the integrated experience on staging;
6. only after approval, decide whether to replace the old production `/eta` implementation or promote v1 behind the existing front door.

## Build locally

From `eta_ml/`:

```bash
python -m pip install -r requirements.txt
python train.py
python -m pytest -q
python package_lambda.py
```

## Deploy staging only

Requires AWS credentials with permission to deploy Lambda, API Gateway, CloudFormation, IAM role resources, and the SAM artifact bucket.

```bash
sam build --template-file template.staging.yaml

sam deploy \
  --stack-name edge-scv-eta-v1-staging \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides AllowedOrigin=https://staging.patmullee.com
```

After deployment, copy the `EtaV1StagingBaseUrl` output into the portfolio repository's staging secret `REACT_APP_SCV_API_BASE`.

Do **not** set that variable in the production workflow until the staging result is reviewed and explicitly approved.

## Deliberate omissions

- No SageMaker: unnecessary for a 200-tree-scale frozen tabular model.
- No database/S3 read on inference: model and calibration residuals are frozen in the versioned JSON artifact.
- No SHAP dependency in the point-prediction Lambda: SHAP remains in the analysis package until we choose a deliberate explanation-serving path.
