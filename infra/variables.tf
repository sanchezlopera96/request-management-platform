variable "project" {
  description = "Prefijo de los nombres de los recursos."
  type        = string
  default     = "request-desk"
}

variable "environment" {
  description = "Ambiente (dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Región de AWS."
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Dos zonas de disponibilidad de la región."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "Se requieren exactamente dos zonas de disponibilidad."
  }
}

variable "vpc_cidr" {
  description = "Rango de direcciones de la VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "api_image_tag" {
  description = "Tag de la imagen de la API en ECR."
  type        = string
  default     = "latest"
}

variable "api_cpu" {
  description = "CPU de cada tarea Fargate (unidades)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memoria de cada tarea Fargate (MiB)."
  type        = number
  default     = 1024
}

variable "api_min_tasks" {
  description = "Tareas mínimas de la API (al menos 2 para alta disponibilidad)."
  type        = number
  default     = 2
}

variable "api_max_tasks" {
  description = "Tareas máximas de la API."
  type        = number
  default     = 6
}

variable "cloudfront_origin_prefix_list_id" {
  description = "Prefix list administrada de CloudFront (origin-facing) de la región; restringe quién llega al ALB."
  type        = string
  default     = "pl-3b927c52"
}

variable "offline_plan" {
  description = "Solo para validar sin cuenta de AWS: omite las verificaciones de credenciales del provider."
  type        = bool
  default     = false
}
