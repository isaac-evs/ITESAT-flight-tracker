# Permanent, off-DynamoDB backup for mission telemetry. Point-in-time
# recovery (see dynamodb.tf) only covers a rolling 35-day window and
# protects against accidental writes/deletes - this is the actual
# long-term archive: a daily snapshot with no automatic expiration, so
# real mission data survives independent of anything that happens to the
# live table.
resource "aws_backup_vault" "telemetry" {
  name = "${var.name_prefix}-telemetry-backup-vault"
}

resource "aws_backup_plan" "telemetry" {
  name = "${var.name_prefix}-telemetry-backup-plan"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.telemetry.name
    schedule          = "cron(0 5 * * ? *)" # 05:00 UTC daily
    # No lifecycle block: backups are kept indefinitely rather than
    # auto-expiring, unlike the DynamoDB TTL this replaces for archival
    # purposes. Prune manually from the vault if that's ever wanted.
  }
}

resource "aws_iam_role" "backup" {
  name = "${var.name_prefix}-telemetry-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "backup.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_selection" "telemetry" {
  name         = "${var.name_prefix}-telemetry-backup-selection"
  plan_id      = aws_backup_plan.telemetry.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = [aws_dynamodb_table.telemetry.arn]
}
