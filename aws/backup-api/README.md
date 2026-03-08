# AWS Backup API (Lambda + S3)

This folder contains a deployable API for app cloud backup:
- `PUT /backup/{uid}` saves a user's backup payload to S3.
- `GET /backup/{uid}` returns a user's backup payload from S3.
- Firebase ID token is required (`Authorization: Bearer <token>`).
- The token UID must match `{uid}`.

## Prerequisites

- AWS account with permissions for CloudFormation, Lambda, API Gateway, S3, IAM
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- AWS CLI configured (`aws configure`)
- Firebase service account JSON for your Firebase project

## 1) Install Lambda dependencies

```bash
cd aws/backup-api
npm install
```

If you hit npm cache permission (`EACCES`) errors, either:

```bash
sudo chown -R "$(id -u):$(id -g)" ~/.npm
```

or use a project-local cache (no sudo):

```bash
npm install --cache ../../.npm_cache_local
```

## 2) Prepare Firebase service account JSON

Create/download from Firebase Console:
- Project Settings -> Service accounts -> Generate new private key

Keep the JSON secure. Do not commit it.

## 3) Build and deploy with SAM

```bash
cd aws/backup-api
sam build --template-file template.yaml
sam deploy --guided
```

If `sam` is not found, install AWS SAM CLI first:
- macOS (Homebrew): `brew install aws-sam-cli`
- Verify: `sam --version`

When prompted for parameters:
- `StageName`: `prod` (or your preferred stage)
- `BackupKeyPrefix`: `backups`
- `FirebaseServiceAccountJson`: paste compact JSON string

To compact JSON quickly:

```bash
jq -c . path/to/firebase-service-account.json
```

## 4) Copy output URLs into app `.env`

After deploy, copy CloudFormation outputs:
- `BackupUploadUrlTemplate`
- `BackupDownloadUrlTemplate`

Set them in `/Users/Bensam/Desktop/budget-app/.env`:

```env
EXPO_PUBLIC_AWS_BACKUP_UPLOAD_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod/backup/{uid}
EXPO_PUBLIC_AWS_BACKUP_DOWNLOAD_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod/backup/{uid}
```

Then restart Expo:

```bash
npx expo start -c
```

## API contract (matches app)

- `GET /backup/{uid}`
  - `200`: returns backup JSON body
  - `404`/`204`: no backup yet
- `PUT /backup/{uid}`
  - body: JSON backup payload from app
  - `200`: returns `{ ok: true, bucket, key, etag, uploadedAt }`

## Security notes

- S3 bucket is private, encrypted, versioned, and retained on stack deletion.
- Lambda verifies Firebase token server-side.
- Only same-user access is allowed (`decoded.uid === {uid}`).
- Avoid wildcard CORS origins for production web clients.
