variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "iot_topic" {
  type = string
}

variable "lambda_runtime" {
  type    = string
  default = "python3.12"
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "cloudfront_domain_name" {
  description = "The web app's CloudFront domain, allowed to call GET /telemetry from a browser."
  type        = string
}

variable "enable_dynamodb_pitr" {
  description = "Point-in-time recovery: restore the table to any second in the last 35 days. Adds ~$0.20/GB-month; on by default for real mission data."
  type        = bool
  default     = true
}

variable "enable_dynamodb_ttl" {
  description = "Whether DynamoDB auto-deletes records older than dynamodb_ttl_days. Off by default so real mission telemetry is kept indefinitely."
  type        = bool
  default     = false
}

variable "dynamodb_ttl_days" {
  description = "Only takes effect when enable_dynamodb_ttl is true. Records older than this are auto-deleted, so repeated local test flights don't accumulate storage cost forever."
  type        = number
  default     = 90
}
