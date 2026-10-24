output "network" {
  value = docker_network.loglens.name
}

output "web_url" {
  value = "http://127.0.0.1:${var.web_host_port}"
}

output "images" {
  value = {
    ai  = local.ai_image
    api = local.api_image
    web = local.web_image
  }
}

output "postgres_enabled" {
  value = var.enable_postgres
}

output "iac_note" {
  value = "Desired state is code. terraform plan shows drift; apply creates/updates containers. Destroy tears them down."
}
