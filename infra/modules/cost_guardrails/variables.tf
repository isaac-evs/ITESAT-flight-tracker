variable "name_prefix" {
  type = string
}

variable "project_tag_value" {
  description = "Value of the 'Project' tag used to scope the budget to this project's resources (matches the default_tags on the aws provider)."
  type        = string
}

variable "budget_limit_usd" {
  description = "Monthly budget ceiling in USD. The stop action fires at 100% of this."
  type        = number
  default     = 30
}

variable "budget_warning_threshold_pct" {
  description = "Percentage of budget_limit_usd at which a warning email is sent (default 50% = $15 of a $30 budget)."
  type        = number
  default     = 50
}

variable "budget_alert_email" {
  description = "Email address to notify for both the warning and the stop action."
  type        = string
}

variable "enable_deny_action" {
  description = "If true, automatically attaches a deny-all policy to the ingestion Lambda roles once spend hits 100% of budget_limit_usd, halting further cost accrual. If false, only sends notifications."
  type        = bool
  default     = true
}

variable "deny_target_role_names" {
  description = "IAM role names to lock down when the budget is exceeded (the webhook_parser and telemetry_reader Lambda roles)."
  type        = list(string)
  default     = []
}
