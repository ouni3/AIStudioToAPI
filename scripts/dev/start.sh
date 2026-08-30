#!/usr/bin/env bash
# scripts/dev/start.sh - AIStudioToAPI 服务启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

# 检测运行模式（Docker容器 / 本地 Node 进程）
if [ -f "docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose ps >/dev/null 2>&1; then
    echo "[INFO] Starting service via Docker Compose..."
    docker compose up -d
else
    echo "[INFO] Starting service via Node.js..."
    if command -v npm >/dev/null 2>&1; then
        npm run start &
        echo "[INFO] Service started in background. PID: $!"
    else
        echo "[ERROR] npm is not installed."
        exit 1
    fi
fi
