output "web_url" {
  description = "URL pública de la aplicación (CloudFront)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "api_ecr_repository_url" {
  description = "Repositorio ECR donde se publica la imagen de la API."
  value       = aws_ecr_repository.api.repository_url
}

output "web_bucket" {
  description = "Bucket donde se publica el build de Angular."
  value       = aws_s3_bucket.web.bucket
}

output "requests_table" {
  description = "Tabla DynamoDB de solicitudes."
  value       = aws_dynamodb_table.requests.name
}

output "cognito_user_pool_id" {
  description = "User pool de Cognito."
  value       = aws_cognito_user_pool.users.id
}

output "cognito_web_client_id" {
  description = "Cliente de Cognito del frontend."
  value       = aws_cognito_user_pool_client.web.id
}
