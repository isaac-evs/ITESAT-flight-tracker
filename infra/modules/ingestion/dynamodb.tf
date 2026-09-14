# NoSQL store for historic space profile / telemetry records.
resource "aws_dynamodb_table" "telemetry" {
  name         = "${var.name_prefix}-telemetry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "flight_id"
  range_key    = "timestamp"

  attribute {
    name = "flight_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  point_in_time_recovery {
    enabled = var.enable_dynamodb_pitr
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = var.enable_dynamodb_ttl
  }
}
