output "iot_data_endpoint" {
  value = data.aws_iot_endpoint.this.endpoint_address
}

output "cognito_identity_pool_id" {
  value = aws_cognito_identity_pool.mission_control.id
}
