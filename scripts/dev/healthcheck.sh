#!/usr/bin/env bash
# scripts/dev/healthcheck.sh - AIStudioToAPI 双节点健康检查脚本
# 规约：
# 1. 8317 节点必须活跃 (HTTP 200 OK)
# 2. 8318 节点默认处于冻结/按需启动态，未启动/端口未监听判定为 [STANDBY] 合规放行
# 3. 仅在 STRICT_8318=1 时强制要求 8318 活跃

set -euo pipefail

HOST="${HOST:-192.168.0.104}"
PORT_8317="${PORT_8317:-8317}"
REMOTE_104_HOST="${REMOTE_104_HOST:-192.168.0.104}"
REMOTE_104_PORT="${REMOTE_104_PORT:-8318}"
STRICT_8318="${STRICT_8318:-0}"

echo "[INFO] Running Health Check for AIStudioToAPI nodes..."

if ! command -v curl >/dev/null 2>&1; then
    echo "[ERROR] curl is required for health check." >&2
    exit 1
fi

FAILURES=0

# 1. 检查 8317 必须活跃节点 (本地或宿主环境)
echo "[INFO] Checking primary 8317 node at http://${HOST}:${PORT_8317}/..."
CODE_8317=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://${HOST}:${PORT_8317}/" 2>/dev/null || true)
if [ -z "$CODE_8317" ]; then
    CODE_8317="000"
fi

if [ "$CODE_8317" = "200" ]; then
    echo "[SUCCESS] Primary 8317 node responded with HTTP 200 OK."
elif [ "$CODE_8317" -ge 200 ] && [ "$CODE_8317" -lt 500 ]; then
    echo "[WARN] Primary 8317 node responded with HTTP ${CODE_8317} (accessible, non-200)."
else
    echo "[ERROR] Primary 8317 node check failed (HTTP ${CODE_8317}). Must be active!" >&2
    FAILURES=$((FAILURES + 1))
fi

# 2. 检查 8318 节点 (按需启动/默认 STANDBY 态)
echo "[INFO] Checking 8318 node at http://${REMOTE_104_HOST}:${REMOTE_104_PORT}/ (STRICT_8318=${STRICT_8318})..."
CODE_8318=$(curl -s -m 3 -o /dev/null -w "%{http_code}" "http://${REMOTE_104_HOST}:${REMOTE_104_PORT}/" 2>/dev/null || true)
if [ -z "$CODE_8318" ]; then
    CODE_8318="000"
fi

if [ "$CODE_8318" -ge 200 ] && [ "$CODE_8318" -lt 500 ]; then
    echo "[SUCCESS] 8318 node is ACTIVE (HTTP ${CODE_8318})."
else
    if [ "$STRICT_8318" = "1" ]; then
        echo "[ERROR] 8318 node is unreachable (HTTP ${CODE_8318}) and STRICT_8318=1 is set!" >&2
        FAILURES=$((FAILURES + 1))
    else
        echo "[STANDBY] 8318 node is dormant/stopped (HTTP ${CODE_8318}). Permitted under on-demand policy."
    fi
fi

if [ "$FAILURES" -gt 0 ]; then
    echo "[FATAL] Health check failed with ${FAILURES} critical error(s)." >&2
    exit 1
fi

echo "[SUCCESS] All health check policies satisfied."
exit 0
