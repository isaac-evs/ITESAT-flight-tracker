provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "EMIDSS-8"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
