locals {
  web_origin   = "https://${var.cloudfront_domain_name}"
  cors_origins = [local.web_origin, "http://localhost:5173"]
}
