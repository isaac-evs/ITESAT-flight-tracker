# ---------------------------------------------------------------------------
# webhook_parser: receives the Rock7/RockBLOCK SBD delivery webhook
# ---------------------------------------------------------------------------

data "archive_file" "webhook_parser" {
  type        = "zip"
  source_dir  = "${path.module}/../../../api/webhook_parser"
  output_path = "${path.module}/build/webhook_parser.zip"
}

resource "aws_iam_role" "webhook_parser" {
  name = "${var.name_prefix}-webhook-parser-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "webhook_parser_basic_execution" {
  role       = aws_iam_role.webhook_parser.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "webhook_parser_ingest" {
  name = "${var.name_prefix}-webhook-parser-ingest"
  role = aws_iam_role.webhook_parser.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteTelemetry"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.telemetry.arn
      },
      {
        Sid      = "PublishLiveLocation"
        Effect   = "Allow"
        Action   = ["iot:Publish"]
        Resource = "arn:aws:iot:${var.aws_region}:${var.account_id}:topic/${var.iot_topic}"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "webhook_parser" {
  name              = "/aws/lambda/${var.name_prefix}-webhook-parser"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "webhook_parser" {
  function_name = "${var.name_prefix}-webhook-parser"
  role          = aws_iam_role.webhook_parser.arn
  handler       = "handler.lambda_handler"
  runtime       = var.lambda_runtime
  timeout       = 10
  memory_size   = 128

  filename         = data.archive_file.webhook_parser.output_path
  source_code_hash = data.archive_file.webhook_parser.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.telemetry.name
      IOT_TOPIC      = var.iot_topic
      TTL_DAYS       = tostring(var.dynamodb_ttl_days)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.webhook_parser,
    aws_iam_role_policy_attachment.webhook_parser_basic_execution,
  ]
}

# ---------------------------------------------------------------------------
# telemetry_reader: serves telemetry history to the mission-control web app
# ---------------------------------------------------------------------------

data "archive_file" "telemetry_reader" {
  type        = "zip"
  source_dir  = "${path.module}/../../../api/telemetry_reader"
  output_path = "${path.module}/build/telemetry_reader.zip"
}

resource "aws_iam_role" "telemetry_reader" {
  name = "${var.name_prefix}-telemetry-reader-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "telemetry_reader_basic_execution" {
  role       = aws_iam_role.telemetry_reader.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "telemetry_reader_read" {
  name = "${var.name_prefix}-telemetry-reader-read"
  role = aws_iam_role.telemetry_reader.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ReadTelemetry"
      Effect   = "Allow"
      Action   = ["dynamodb:Query", "dynamodb:Scan"]
      Resource = aws_dynamodb_table.telemetry.arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "telemetry_reader" {
  name              = "/aws/lambda/${var.name_prefix}-telemetry-reader"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "telemetry_reader" {
  function_name = "${var.name_prefix}-telemetry-reader"
  role          = aws_iam_role.telemetry_reader.arn
  handler       = "handler.lambda_handler"
  runtime       = var.lambda_runtime
  timeout       = 10
  memory_size   = 128

  filename         = data.archive_file.telemetry_reader.output_path
  source_code_hash = data.archive_file.telemetry_reader.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE    = aws_dynamodb_table.telemetry.name
      CORS_ALLOW_ORIGIN = local.web_origin
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.telemetry_reader,
    aws_iam_role_policy_attachment.telemetry_reader_basic_execution,
  ]
}
