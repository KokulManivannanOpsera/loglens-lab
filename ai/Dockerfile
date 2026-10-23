# LogLens AI brain (Python / FastAPI)
# Build from labs/loglens:  docker build -f ai/Dockerfile -t loglens-ai:0.1 .

FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8092
ENV KNOWLEDGE_DIR=/app/knowledge/runbooks

COPY ai/requirements.txt ./requirements.txt
RUN apt-get update \
  && apt-get upgrade -y \
  && pip install --no-cache-dir -r requirements.txt \
  && rm -rf /var/lib/apt/lists/*

COPY ai/app ./app
# Shared runbooks from the Node package (same corpus as A2)
COPY server/knowledge/runbooks ./knowledge/runbooks

EXPOSE 8092
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8092"]
