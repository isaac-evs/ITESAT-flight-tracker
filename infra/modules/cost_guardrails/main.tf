# Monthly cost budget for this project's tagged resources: a warning email
# at budget_warning_threshold_pct (default 50% = $15 of $30) and, at 100%
# ($30), an automatic hard stop that denies the ingestion Lambdas so cost
# accrual halts rather than running up the AWS bill unattended.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Project$%s", var.project_tag_value)]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.budget_warning_threshold_pct
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

# --- Hard stop: deny the ingestion Lambda roles once spend hits 100% -------

resource "aws_iam_policy" "deny_all" {
  count = var.enable_deny_action ? 1 : 0

  name = "${var.name_prefix}-cost-guardrail-deny"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DenyAllOnOverspend"
      Effect   = "Deny"
      Action   = "*"
      Resource = "*"
    }]
  })
}

resource "aws_iam_role" "budget_action_execution" {
  count = var.enable_deny_action ? 1 : 0

  name = "${var.name_prefix}-budget-action-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "budgets.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "budget_action_execution" {
  count = var.enable_deny_action ? 1 : 0

  name = "${var.name_prefix}-budget-action-policy"
  role = aws_iam_role.budget_action_execution[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListPolicyVersions",
        "iam:ListEntitiesForPolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
      ]
      Resource = concat(
        [aws_iam_policy.deny_all[0].arn],
        [for name in var.deny_target_role_names : "arn:aws:iam::*:role/${name}"],
      )
    }]
  })
}

resource "aws_budgets_budget_action" "deny_on_overspend" {
  count = var.enable_deny_action ? 1 : 0

  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action_execution[0].arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_all[0].arn
      roles      = var.deny_target_role_names
    }
  }

  subscriber {
    subscription_type = "EMAIL"
    address           = var.budget_alert_email
  }
}
