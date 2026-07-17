# scripts/ — скрипты запуска и остановки

Тонкие обёртки над `docker compose` для трёх платформ.

- `start.sh` / `stop.sh` — Linux и macOS (POSIX sh)
- `start.ps1` / `stop.ps1` — Windows PowerShell

Скрипты выполняют `cd` в корень проекта относительно себя, поэтому их можно запускать из любого каталога.

## Использование

Windows:
```
scripts\start.ps1
scripts\stop.ps1
```

Linux/macOS:
```
./scripts/start.sh
./scripts/stop.sh
```

После запуска приложение доступно на `http://localhost:8000`.
