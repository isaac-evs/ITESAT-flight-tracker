output "web_app_bucket_name" {
  value = aws_s3_bucket.web_app.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.web_app.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.web_app.id
}
