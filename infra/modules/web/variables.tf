variable "name_prefix" {
  description = "Short prefix applied to all resource names."
  type        = string
}

variable "cloudfront_price_class" {
  description = "Restricts which edge locations serve the app. PriceClass_100 (US/Canada/Europe only) is the cheapest tier; PriceClass_All is most expensive."
  type        = string
  default     = "PriceClass_100"
}
