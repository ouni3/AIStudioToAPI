#!/usr/bin/env bash
# scripts/dev/stop.sh - AIStudioToAPI 服务停止脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

echo "[INFO] Stopping AIStudioToAPI service..."

# 如果使用 Docker Compose，优先关闭容器
if [ -f "docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
    docker compose down 2>/dev/null || true
fi

# 终止主程序 node main.js 进程
PIDS=$(pgrep -f "node.*main\.js" || true)

if [ -n "$PIDS" ]; then
    echo "[INFO] Terminating Node.js processes: $PIDS"
    kill $PIDS 2>/dev/null || true
    sleep 1
    # 强制清除残留
    REMAINING=$(pgrep -f "node.*main\.js" || true)
    if [ -n "$REMAINING" ]; then
        echo "[WARN] Force killing remaining processes: $REMAINING"
        kill -9 $REMAINING 2>/dev/null || true
    fi
    echo "[INFO] Service stopped successfully."
else
    echo "[INFO] No running service process found."
fi
