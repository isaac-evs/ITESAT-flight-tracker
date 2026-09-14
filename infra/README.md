# EMIDSS-8 Infra

Terraform for the AWS ingestion + delivery backend shown in the architecture
diagram: RockBLOCK webhook → API Gateway → Lambda → DynamoDB + IoT Core, and
S3 + CloudFront for the React mission-control web app.

## Layout

Root module wires four child modules together:

- `modules/ingestion` — DynamoDB telemetry table, the `webhook_parser` and
  `telemetry_reader` Lambdas + IAM roles, and the HTTP API
  (`POST /webhook`, `GET /telemetry`)
- `modules/realtime` — IoT Core data endpoint + a Cognito Identity Pool
  giving mission-control clients guest credentials to subscribe/receive on
  the live-tracking MQTT topic directly from the browser/app
- `modules/web` — private S3 bucket + CloudFront distribution serving the
  built React app (SPA routing via 403/404 → `index.html`)
- `modules/cost_guardrails` — see below

`main.tf` wires the modules, `variables.tf`/`outputs.tf` are the root
interface, `versions.tf`/`providers.tf` are global provider setup.

## Cost guardrails

`modules/cost_guardrails` creates an [AWS Budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
scoped to this project's tagged resources (`Project = EMIDSS-8`):

- At **50% of `budget_limit_usd`** (default: $15 of $30) — a warning email
  to `budget_alert_email`.
- At **100%** (default: $30) — a warning email **and**, if
  `enable_budget_deny_action = true` (the default), an automatic AWS Budgets
  Action that attaches a deny-all IAM policy to the `webhook_parser` and
  `telemetry_reader` Lambda roles. Their invocations then fail immediately
  with `AccessDenied` instead of writing to DynamoDB or publishing to IoT
  Core, which halts further cost accrual from this project without
  deleting anything. Existing data, the API Gateway, and the web app stay up.

This is a real, automatic action with `approval_model = "AUTOMATIC"` — no
manual confirmation step. If that's riskier for your use case than the
overspend itself, set `enable_budget_deny_action = false` to keep only the
email notifications. To recover after a trip, manually detach the
`*-cost-guardrail-deny` policy from the two Lambda roles (or bump
`budget_limit_usd` and `terraform apply` — that alone does not reattach a
policy already applied by the budget action).

`budget_alert_email` is required — AWS Budgets needs at least one subscriber.

## Pricing choices already made

- DynamoDB is `PAY_PER_REQUEST` (no idle cost) with point-in-time recovery
  **on** by default (`enable_dynamodb_pitr`) and TTL **off** by default
  (`enable_dynamodb_ttl`), so real mission telemetry is never
  auto-deleted. Set `enable_dynamodb_ttl = true` (and adjust
  `dynamodb_ttl_days`, default 90) only for throwaway local test/bench data
  you don't want accumulating storage cost.
- CloudFront `price_class` defaults to `PriceClass_100` (US/Canada/Europe
  edge locations only), the cheapest tier.
- S3 versioning is on (rollback safety) but noncurrent versions expire
  after 30 days and abandoned multipart uploads abort after 7.
- CloudWatch Logs retention is capped at `log_retention_days` (default 14).
- Lambdas run at the minimum practical memory (128MB) with a 10s timeout.

## Backups

Two independent layers protect the telemetry table, since PITR and AWS
Backup cover different failure modes:

- **Point-in-time recovery** (`enable_dynamodb_pitr`, on by default):
  restore the table to any second within the last 35 days. Protects
  against accidental writes/deletes discovered soon after they happen.
- **AWS Backup** (`modules/ingestion/backup.tf`): a daily snapshot (05:00
  UTC) into a dedicated backup vault, with no automatic expiration — the
  actual permanent archive. Restoring from it (a new table, or overwriting
  the existing one) is done from the AWS Backup console or CLI, not
  Terraform. Storage cost is proportional to table size and is negligible
  at this project's scale (a few hundred records per flight).

## Usage

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # set budget_alert_email, adjust as needed
terraform init
terraform plan
terraform apply
```

State is local for now (`terraform.tfstate`, gitignored). Migrate to an S3
backend later if multiple people need to run this.

After `apply`, point Rock7's delivery webhook at the `webhook_url` output, and
sync the built React app to the `web_app_bucket_name` bucket, then invalidate
`cloudfront_distribution_id` on each deploy.
