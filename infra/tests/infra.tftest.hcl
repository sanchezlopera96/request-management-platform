mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/0123456789abcdef"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/0123456789abcdef"
    }
  }

  mock_resource "aws_lb_listener" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/0123456789abcdef/0123456789abcdef"
    }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = {
      arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:mock-AbCdEf"
    }
  }

  mock_resource "aws_dynamodb_table" {
    defaults = {
      arn = "arn:aws:dynamodb:us-east-1:123456789012:table/mock"
    }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/mock:1"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn = "arn:aws:cloudfront::123456789012:distribution/MOCK"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock-bucket"
    }
  }
}

variables {
  offline_plan = true
}

run "la_tabla_coincide_con_la_definicion_de_la_api" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.requests.hash_key == "PK" && aws_dynamodb_table.requests.range_key == "SK"
    error_message = "La tabla debe usar PK/SK, igual que api/src/infra/dynamodb/table.ts."
  }

  assert {
    condition = anytrue([
      for gsi in aws_dynamodb_table.requests.global_secondary_index :
      gsi.name == "GSI1" && gsi.projection_type == "ALL" &&
      contains([for k in gsi.key_schema : "${k.attribute_name}:${k.key_type}"], "GSI1PK:HASH") &&
      contains([for k in gsi.key_schema : "${k.attribute_name}:${k.key_type}"], "GSI1SK:RANGE")
    ])
    error_message = "Falta el índice GSI1 (GSI1PK/GSI1SK) que usa el filtro por estado."
  }

  assert {
    condition     = aws_dynamodb_table.requests.point_in_time_recovery[0].enabled && aws_dynamodb_table.requests.deletion_protection_enabled
    error_message = "La tabla debe tener recuperación a un punto en el tiempo y protección contra borrado."
  }
}

run "la_api_no_puede_recorrer_la_tabla" {
  command = apply

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.api_task_dynamodb.statement :
      !contains(s.actions, "dynamodb:Scan") && !contains(s.actions, "dynamodb:BatchWriteItem") && !contains(s.actions, "dynamodb:*")
    ])
    error_message = "El rol de la API no debe tener Scan, BatchWriteItem ni comodines sobre DynamoDB."
  }
}

run "las_tareas_no_son_accesibles_desde_internet" {
  command = apply

  assert {
    condition     = aws_ecs_service.api.network_configuration[0].assign_public_ip == false
    error_message = "Las tareas de la API no deben tener IP pública."
  }

  assert {
    condition     = toset(aws_ecs_service.api.network_configuration[0].subnets) == toset(aws_subnet.private[*].id)
    error_message = "Las tareas deben correr en las subredes privadas."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.api_from_alb.referenced_security_group_id == aws_security_group.alb.id
    error_message = "Las tareas solo deben aceptar tráfico del ALB."
  }
}

run "el_alb_solo_atiende_a_cloudfront" {
  command = apply

  assert {
    condition     = aws_vpc_security_group_ingress_rule.alb_from_cloudfront.prefix_list_id == var.cloudfront_origin_prefix_list_id && aws_vpc_security_group_ingress_rule.alb_from_cloudfront.cidr_ipv4 == null
    error_message = "El ALB solo debe aceptar tráfico de la prefix list de CloudFront."
  }

  assert {
    condition     = aws_lb_listener.http.default_action[0].fixed_response[0].status_code == "403"
    error_message = "Sin la cabecera secreta de CloudFront, el ALB debe responder 403."
  }
}

run "los_secretos_no_se_exponen" {
  command = apply

  assert {
    condition     = aws_secretsmanager_secret_version.cursor.secret_string == null
    error_message = "El secreto del cursor debe escribirse como write-only y no quedar en el estado."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets[0].name == "CURSOR_SECRET" &&
      !contains([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : e.name], "CURSOR_SECRET")
    )
    error_message = "CURSOR_SECRET debe inyectarse desde Secrets Manager, no como variable en texto plano."
  }

  assert {
    condition     = contains([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : "${e.name}=${e.value}"], "AUTH_MODE=jwks")
    error_message = "En AWS la API debe validar tokens de Cognito (AUTH_MODE=jwks)."
  }
}

run "el_frontend_es_privado_y_no_altera_las_respuestas_de_la_api" {
  command = apply

  assert {
    condition = (
      aws_s3_bucket_public_access_block.web.block_public_acls && aws_s3_bucket_public_access_block.web.block_public_policy &&
      aws_s3_bucket_public_access_block.web.ignore_public_acls && aws_s3_bucket_public_access_block.web.restrict_public_buckets
    )
    error_message = "El bucket del frontend debe bloquear todo acceso público."
  }

  assert {
    condition     = length(aws_cloudfront_distribution.main.custom_error_response) == 0
    error_message = "No debe haber respuestas de error personalizadas: reescribirían los 404 de la API (problema 3)."
  }

  assert {
    condition = anytrue([
      for b in aws_cloudfront_distribution.main.ordered_cache_behavior :
      b.path_pattern == "/api/*" && b.cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    ])
    error_message = "Las respuestas de /api/* no deben quedar en caché de CloudFront."
  }
}
