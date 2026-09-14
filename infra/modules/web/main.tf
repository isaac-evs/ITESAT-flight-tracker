# Private S3 bucket holding the built React app, served exclusively via CloudFront.
resource "aws_s3_bucket" "web_app" {
  bucket = "${var.name_prefix}-web-app"
}

resource "aws_s3_bucket_public_access_block" "web_app" {
  bucket                  = aws_s3_bucket.web_app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "web_app" {
  bucket = aws_s3_bucket.web_app.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Cost optimization: versioning is on (so a bad deploy can be rolled back),
# but old versions and abandoned multipart uploads shouldn't accumulate
# storage cost forever.
resource "aws_s3_bucket_lifecycle_configuration" "web_app" {
  bucket = aws_s3_bucket.web_app.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web_app" {
  name                              = "${var.name_prefix}-web-app-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "web_app" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.name_prefix} mission control web app"
  price_class         = var.cloudfront_price_class

  origin {
    domain_name              = aws_s3_bucket.web_app.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.web_app.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.web_app.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-${aws_s3_bucket.web_app.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # SPA fallback: unknown paths resolve to index.html for client-side routing.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "web_app_cloudfront" {
  bucket = aws_s3_bucket.web_app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipal"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.web_app.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.web_app.arn
        }
      }
    }]
  })
}
