$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker compose up -d --build
Write-Output "PM MVP запущен на http://localhost:8000"
