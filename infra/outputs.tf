output "webhook_url" {
  description = "Public URL for the Rock7/RockBLOCK SBD webhook (POST /webhook)."
  value       = module.ingestion.webhook_url
}

output "api_base_url" {
  description = "Base URL of the HTTP API (used by the web app for GET /telemetry)."
  value       = module.ingestion.api_base_url
}

output "dynamodb_table_name" {
  description = "DynamoDB table storing historic telemetry records."
  value       = module.ingestion.dynamodb_table_name
}

output "iot_data_endpoint" {
  description = "AWS IoT Core data-plane endpoint for MQTT/WSS connections."
  value       = module.realtime.iot_data_endpoint
}

output "iot_topic" {
  description = "MQTT topic clients should subscribe to for live tracking updates."
  value       = var.iot_topic
}

output "cognito_identity_pool_id" {
  description = "Identity Pool ID used by mission control clients to obtain guest IoT credentials."
  value       = module.realtime.cognito_identity_pool_id
}

output "web_app_bucket_name" {
  description = "S3 bucket to which the built React app should be synced/deployed."
  value       = module.web.web_app_bucket_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain serving the mission control web app."
  value       = module.web.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID, useful for cache invalidations on deploy."
  value       = module.web.cloudfront_distribution_id
}

output "budget_name" {
  description = "AWS Budgets budget tracking this project's monthly spend."
  value       = module.cost_guardrails.budget_name
}

output "backup_vault_name" {
  description = "AWS Backup vault holding daily telemetry snapshots."
  value       = module.ingestion.backup_vault_name
}

output "backup_plan_id" {
  description = "AWS Backup plan ID for the telemetry table's daily backup."
  value       = module.ingestion.backup_plan_id
}
