locals {
  api_dynamodb_actions = [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:Query",
    "dynamodb:ConditionCheckItem",
  ]
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_execution" {
  name               = "${local.name}-api-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "api_execution" {
  role       = aws_iam_role.api_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "api_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.cursor.arn]
  }
}

resource "aws_iam_role_policy" "api_execution_secrets" {
  name   = "read-cursor-secret"
  role   = aws_iam_role.api_execution.id
  policy = data.aws_iam_policy_document.api_execution_secrets.json
}

resource "aws_iam_role" "api_task" {
  name               = "${local.name}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "api_task_dynamodb" {
  statement {
    actions   = local.api_dynamodb_actions
    resources = [aws_dynamodb_table.requests.arn, "${aws_dynamodb_table.requests.arn}/index/*"]
  }
}

resource "aws_iam_role_policy" "api_task_dynamodb" {
  name   = "requests-table"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_task_dynamodb.json
}
