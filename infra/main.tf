data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.prefix}-${var.environment}"
}

module "web" {
  source = "./modules/web"

  name_prefix            = local.name_prefix
  cloudfront_price_class = var.cloudfront_price_class
}

module "ingestion" {
  source = "./modules/ingestion"

  name_prefix            = local.name_prefix
  aws_region             = var.aws_region
  account_id             = data.aws_caller_identity.current.account_id
  iot_topic              = var.iot_topic
  lambda_runtime         = var.lambda_runtime
  log_retention_days     = var.log_retention_days
  cloudfront_domain_name = module.web.cloudfront_domain_name
  enable_dynamodb_pitr   = var.enable_dynamodb_pitr
  enable_dynamodb_ttl    = var.enable_dynamodb_ttl
  dynamodb_ttl_days      = var.dynamodb_ttl_days
}

module "realtime" {
  source = "./modules/realtime"

  name_prefix = local.name_prefix
  aws_region  = var.aws_region
  account_id  = data.aws_caller_identity.current.account_id
  iot_topic   = var.iot_topic
}

module "cost_guardrails" {
  source = "./modules/cost_guardrails"

  name_prefix                  = local.name_prefix
  project_tag_value            = "EMIDSS-8"
  budget_limit_usd             = var.budget_limit_usd
  budget_warning_threshold_pct = var.budget_warning_threshold_pct
  budget_alert_email           = var.budget_alert_email
  enable_deny_action           = var.enable_budget_deny_action
  deny_target_role_names = [
    module.ingestion.webhook_parser_role_name,
    module.ingestion.telemetry_reader_role_name,
  ]
}
