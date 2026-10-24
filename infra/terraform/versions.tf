# D11 — Infra as code (light)
# Declare desired LogLens stack; apply locally via Docker provider (no cloud card).

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {
  # Uses local Docker daemon (DOCKER_HOST if set)
}
