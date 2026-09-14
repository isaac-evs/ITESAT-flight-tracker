output "webhook_url" {
  value = "${aws_apigatewayv2_api.webhook.api_endpoint}/webhook"
}

output "api_base_url" {
  value = aws_apigatewayv2_api.webhook.api_endpoint
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.telemetry.name
}

output "webhook_parser_role_name" {
  value = aws_iam_role.webhook_parser.name
}

output "telemetry_reader_role_name" {
  value = aws_iam_role.telemetry_reader.name
}

output "backup_vault_name" {
  value = aws_backup_vault.telemetry.name
}

output "backup_plan_id" {
  value = aws_backup_plan.telemetry.id
}
