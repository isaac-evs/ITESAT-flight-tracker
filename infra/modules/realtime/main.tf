data "aws_iot_endpoint" "this" {
  endpoint_type = "iot:Data-ATS"
}

# AWS IoT Core is a per-account managed broker (no cluster to provision).
# Clients (chase-vehicle Tauri app, recovery-team web view) connect directly
# over MQTT/WSS using temporary guest credentials from this Identity Pool,
# scoped to read-only access on the live-tracking topic.
resource "aws_cognito_identity_pool" "mission_control" {
  identity_pool_name               = "${var.name_prefix}-mission-control"
  allow_unauthenticated_identities = true
}

resource "aws_iam_role" "iot_guest_subscriber" {
  name = "${var.name_prefix}-iot-guest-subscriber-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = "cognito-identity.amazonaws.com" }
      Condition = {
        StringEquals = {
          "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.mission_control.id
        }
        "ForAnyValue:StringLike" = {
          "cognito-identity.amazonaws.com:amr" = "unauthenticated"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "iot_guest_subscriber" {
  name = "${var.name_prefix}-iot-guest-subscriber-policy"
  role = aws_iam_role.iot_guest_subscriber.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Connect"
        Effect   = "Allow"
        Action   = ["iot:Connect"]
        Resource = "arn:aws:iot:${var.aws_region}:${var.account_id}:client/$${cognito-identity.amazonaws.com:sub}-*"
      },
      {
        Sid      = "SubscribeAndReceive"
        Effect   = "Allow"
        Action   = ["iot:Subscribe"]
        Resource = "arn:aws:iot:${var.aws_region}:${var.account_id}:topicfilter/${var.iot_topic}"
      },
      {
        Sid      = "Receive"
        Effect   = "Allow"
        Action   = ["iot:Receive"]
        Resource = "arn:aws:iot:${var.aws_region}:${var.account_id}:topic/${var.iot_topic}"
      }
    ]
  })
}

resource "aws_cognito_identity_pool_roles_attachment" "mission_control" {
  identity_pool_id = aws_cognito_identity_pool.mission_control.id

  roles = {
    unauthenticated = aws_iam_role.iot_guest_subscriber.arn
  }
}
