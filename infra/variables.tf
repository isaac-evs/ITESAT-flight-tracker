variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "prefix" {
  description = "Short prefix applied to all resource names."
  type        = string
  default     = "emidss8"
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "iot_topic" {
  description = "MQTT topic used to broadcast live tracking updates."
  type        = string
  default     = "emidss/live-tracking"
}

variable "lambda_runtime" {
  description = "Python runtime for the webhook parser Lambda."
  type        = string
  default     = "python3.12"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the Lambda function."
  type        = number
  default     = 14
}

variable "cloudfront_price_class" {
  description = "Restricts which edge locations serve the app. PriceClass_100 (US/Canada/Europe only) is the cheapest tier."
  type        = string
  default     = "PriceClass_100"
}

variable "enable_dynamodb_pitr" {
  description = "Point-in-time recovery: restore the table to any second in the last 35 days. Cheap relative to the value for real mission data - on by default."
  type        = bool
  default     = true
}

variable "enable_dynamodb_ttl" {
  description = "Whether DynamoDB auto-deletes records older than dynamodb_ttl_days. Off by default so real mission telemetry is kept indefinitely; only turn on for throwaway test/bench data."
  type        = bool
  default     = false
}

variable "dynamodb_ttl_days" {
  description = "Only takes effect when enable_dynamodb_ttl is true. Records older than this are auto-deleted, so repeated test flights don't accumulate storage cost."
  type        = number
  default     = 90
}

# --- Cost guardrails ---------------------------------------------------

variable "budget_alert_email" {
  description = "Email notified for both the budget warning and the hard-stop action. Required - AWS Budgets needs at least one subscriber."
  type        = string
}

variable "budget_limit_usd" {
  description = "Monthly budget ceiling in USD. The automatic hard stop fires at 100% of this."
  type        = number
  default     = 30
}

variable "budget_warning_threshold_pct" {
  description = "Percent of budget_limit_usd at which a warning email is sent (default 50% = $15 of a $30 budget)."
  type        = number
  default     = 50
}

variable "enable_budget_deny_action" {
  description = "If true, automatically denies the ingestion Lambda roles once spend hits 100% of budget_limit_usd. If false, only sends the notification emails - set this to false if an automatic hard stop is riskier than the overspend for your use case."
  type        = bool
  default     = true
}
