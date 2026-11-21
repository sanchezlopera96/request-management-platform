resource "aws_dynamodb_table" "requests" {
  name         = "${local.name}-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = true
}

ephemeral "random_password" "cursor_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "cursor" {
  name                    = "${local.name}/cursor-secret"
  description             = "Llave HMAC de los cursores de paginación de la API."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "cursor" {
  secret_id                = aws_secretsmanager_secret.cursor.id
  secret_string_wo         = ephemeral.random_password.cursor_secret.result
  secret_string_wo_version = 1
}
