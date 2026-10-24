locals {
  network_name = "${var.project}-net"
  ai_image     = "${var.image_registry}-ai:${var.image_tag}"
  api_image    = "${var.image_registry}-api:${var.image_tag}"
  web_image    = "${var.image_registry}-web:${var.image_tag}"
}

resource "docker_network" "loglens" {
  name = local.network_name
}

# Images must already exist locally (npm run docker:build) or be pullable.
resource "docker_image" "ai" {
  name         = local.ai_image
  keep_locally = true
}

resource "docker_image" "api" {
  name         = local.api_image
  keep_locally = true
}

resource "docker_image" "web" {
  name         = local.web_image
  keep_locally = true
}

resource "docker_container" "ai" {
  name  = "${var.project}-ai"
  image = docker_image.ai.image_id

  networks_advanced {
    name = docker_network.loglens.name
  }

  env = [
    "PORT=8092",
    "KNOWLEDGE_DIR=/app/knowledge/runbooks",
    "DIAGNOSE_MODE=auto",
    "OPENAI_API_KEY=${var.openai_api_key}",
  ]

  restart = "unless-stopped"
}

resource "docker_container" "db" {
  count = var.enable_postgres ? 1 : 0

  name  = "${var.project}-db"
  image = "postgres:16-alpine"

  networks_advanced {
    name = docker_network.loglens.name
  }

  env = [
    "POSTGRES_USER=loglens",
    "POSTGRES_PASSWORD=loglens",
    "POSTGRES_DB=loglens",
  ]

  ports {
    internal = 5432
    external = 5433
  }

  restart = "unless-stopped"
}

resource "docker_container" "api" {
  name  = "${var.project}-api"
  image = docker_image.api.image_id

  networks_advanced {
    name = docker_network.loglens.name
  }

  env = concat(
    [
      "PORT=8091",
      "NODE_ENV=production",
      "SESSION_SECRET=${var.session_secret}",
      "DIAGNOSE_MODE=auto",
      "AI_SERVICE_URL=http://${docker_container.ai.name}:8092",
      "AI_SERVICE_REQUIRED=false",
      "OPENAI_API_KEY=${var.openai_api_key}",
    ],
    var.enable_postgres ? [
      "DATABASE_URL=postgres://loglens:loglens@${docker_container.db[0].name}:5432/loglens"
    ] : [],
  )

  restart = "unless-stopped"

  depends_on = [docker_container.ai]
}

resource "docker_container" "web" {
  name  = "${var.project}-web"
  image = docker_image.web.image_id

  networks_advanced {
    name = docker_network.loglens.name
  }

  env = [
    "PORT=80",
    "API_UPSTREAM=http://${docker_container.api.name}:8091",
  ]

  ports {
    internal = 80
    external = var.web_host_port
  }

  restart = "unless-stopped"

  depends_on = [docker_container.api]
}
