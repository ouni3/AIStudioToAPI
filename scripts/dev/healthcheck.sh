#!/usr/bin/env bash
# scripts/dev/healthcheck.sh - AIStudioToAPI 健康检查脚本

set -e

PORT="${PORT:-8317}"
HOST="${HOST:-127.0.0.1}"
REMOTE_104_HOST="${REMOTE_104_HOST:-192.168.3.104}"
REMOTE_104_PORT="${REMOTE_104_PORT:-8317}"

echo "[INFO] Running Health Check for AIStudioToAPI..."

# 检查本地服务
echo "[INFO] Checking local service at http://${HOST}:${PORT}/..."
if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}:${PORT}/" || echo "000")
    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
        echo "[SUCCESS] Local service responded with HTTP status $HTTP_CODE"
    else
        echo "[WARN] Local service check failed or returned HTTP status $HTTP_CODE"
    fi
else
    echo "[WARN] curl not installed, skipping HTTP check."
fi

# 探测 104 远程服务端点（如果设置或可用）
if [ -n "$CHECK_104" ]; then
    echo "[INFO] Checking 104 remote endpoint at http://${REMOTE_104_HOST}:${REMOTE_104_PORT}/..."
    if command -v curl >/dev/null 2>&1; then
        REMOTE_CODE=$(curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" "http://${REMOTE_104_HOST}:${REMOTE_104_PORT}/" || echo "000")
        if [ "$REMOTE_CODE" -ge 200 ] && [ "$REMOTE_CODE" -lt 500 ]; then
            echo "[SUCCESS] Remote 104 service responded with HTTP status $REMOTE_CODE"
        else
            echo "[WARN] Remote 104 service check failed or timed out (HTTP $REMOTE_CODE)"
        fi
    fi
fi

exit 0
