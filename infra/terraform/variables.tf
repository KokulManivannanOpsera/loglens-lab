variable "project" {
  description = "Name prefix for containers / network"
  type        = string
  default     = "loglens"
}

variable "image_registry" {
  description = "Container registry prefix (GHCR owner path or local tags)"
  type        = string
  default     = "loglens"
}

variable "image_tag" {
  description = "Image tag to run (git SHA in CD; lab default 0.1)"
  type        = string
  default     = "0.1"
}

variable "web_host_port" {
  description = "Host port for the UI (nginx)"
  type        = number
  default     = 8088
}

variable "enable_postgres" {
  description = "Also run a Postgres container for History (D7)"
  type        = bool
  default     = false
}

variable "session_secret" {
  description = "API SESSION_SECRET (use TF_VAR_session_secret; never commit real secrets)"
  type        = string
  sensitive   = true
  default     = "dev-change-me-iac-lab"
}

variable "openai_api_key" {
  description = "Optional OPENAI_API_KEY (empty = mock)"
  type        = string
  sensitive   = true
  default     = ""
}
