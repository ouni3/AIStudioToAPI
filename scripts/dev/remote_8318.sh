#!/usr/bin/env bash
# scripts/dev/remote_8318.sh - 104 服务器 8318 节点按需调度脚本
# 支持 start | stop | status | logs 子命令与 HTTP 8318 探活

set -euo pipefail

REMOTE_104_HOST="${REMOTE_104_HOST:-192.168.0.104}"
REMOTE_104_USER="${REMOTE_104_USER:-fy}"
REMOTE_104_PORT="${REMOTE_104_PORT:-8318}"
CONTAINER_NAME="${CONTAINER_NAME:-aistudio-to-api-8318}"
HEALTHCHECK_TIMEOUT="${HEALTHCHECK_TIMEOUT:-30}"

usage() {
    cat <<EOF
Usage: $0 {start|stop|status|logs}

Commands:
  start   启动远程 104 机器上的 8318 容器并执行 HTTP 探活 (上限 ${HEALTHCHECK_TIMEOUT}s)
  stop    停止远程 104 机器上的 8318 容器
  status  检查远程 104 机器上的 8318 容器及端口状态
  logs    获取远程 104 机器上的 8318 容器最新日志 (可传参数如 -n 50)

Environment variables:
  REMOTE_104_HOST   远程 104 服务器 IP/域名 (默认: 192.168.0.104)
  REMOTE_104_USER   远程 SSH 用户名 (默认: fy)
  REMOTE_104_PORT   远程 HTTP 端口 (默认: 8318)
  CONTAINER_NAME    远程 Docker 容器名 (默认: aistudio-to-api-8318)
  HEALTHCHECK_TIMEOUT 探活超时秒数 (默认: 30)
EOF
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

ACTION="$1"
shift || true

run_ssh() {
    local cmd="$1"
    ssh -o BatchMode=yes -o ConnectTimeout=5 "${REMOTE_104_USER}@${REMOTE_104_HOST}" "$cmd"
}

wait_for_health() {
    local url="http://${REMOTE_104_HOST}:${REMOTE_104_PORT}/"
    echo "[INFO] Waiting for service to become healthy at ${url} (timeout: ${HEALTHCHECK_TIMEOUT}s)..."
    local elapsed=0
    local interval=2
    while [ "$elapsed" -lt "$HEALTHCHECK_TIMEOUT" ]; do
        local code
        code=$(curl -s -m 3 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)
        if [ -z "$code" ]; then
            code="000"
        fi
        if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
            echo "[SUCCESS] Service is up and responded with HTTP ${code} after ${elapsed}s."
            return 0
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done
    echo "[ERROR] Service failed to respond within ${HEALTHCHECK_TIMEOUT}s at ${url}." >&2
    return 1
}

case "$ACTION" in
    start)
        echo "[INFO] Starting ${CONTAINER_NAME} on ${REMOTE_104_HOST}..."
        run_ssh "docker start ${CONTAINER_NAME}"
        wait_for_health
        echo "[SUCCESS] 8318 node started successfully and is responsive."
        ;;
    stop)
        echo "[INFO] Stopping ${CONTAINER_NAME} on ${REMOTE_104_HOST}..."
        run_ssh "docker stop ${CONTAINER_NAME}"
        echo "[SUCCESS] 8318 node stopped successfully."
        ;;
    status)
        echo "[INFO] Checking status for ${CONTAINER_NAME} on ${REMOTE_104_HOST}..."
        local_inspect=$(run_ssh "docker inspect -f '{{.State.Status}}' ${CONTAINER_NAME} 2>/dev/null" || echo "not_found")
        echo "[INFO] Container state: ${local_inspect}"
        
        local_code=$(curl -s -m 3 -o /dev/null -w "%{http_code}" "http://${REMOTE_104_HOST}:${REMOTE_104_PORT}/" 2>/dev/null || true)
        if [ -z "$local_code" ]; then
            local_code="000"
        fi
        if [ "$local_code" -ge 200 ] && [ "$local_code" -lt 500 ]; then
            echo "[SUCCESS] HTTP probe: port ${REMOTE_104_PORT} is ACTIVE (HTTP ${local_code})"
        else
            echo "[INFO] HTTP probe: port ${REMOTE_104_PORT} is INACTIVE/STANDBY (HTTP ${local_code})"
        fi
        ;;
    logs)
        echo "[INFO] Fetching logs for ${CONTAINER_NAME} on ${REMOTE_104_HOST}..."
        run_ssh "docker logs ${CONTAINER_NAME} ${*:- --tail 100}"
        ;;
    *)
        echo "[ERROR] Unknown action: ${ACTION}" >&2
        usage
        ;;
esac
