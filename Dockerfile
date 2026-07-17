# Stage 1: build NextJS static export
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json /app/frontend/
RUN npm ci

COPY frontend /app/frontend
RUN npm run build

# Stage 2: Python runtime with FastAPI
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

COPY backend/pyproject.toml /app/backend/pyproject.toml
WORKDIR /app/backend
RUN uv sync --no-install-project

WORKDIR /app
COPY backend /app/backend
COPY --from=frontend-builder /app/frontend/out /app/static

WORKDIR /app/backend

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
