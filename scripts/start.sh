#!/bin/sh
set -e
cd "$(dirname "$0")/.."
docker compose up -d --build
echo "PM MVP запущен на http://localhost:8000"
