#!/usr/bin/env bash
# scripts/dev/remote_8317_deploy.sh - 104 服务器 8317 主节点部署与更新运维脚本
# 流程：
# 1. 增量 rsync 同步代码至 104 服务器，排除 node_modules, .git, configs/auth, data 等敏感与本地环境目录
# 2. 在 104 机器上构建镜像 aistudio-to-api-custom:latest
# 3. 重启 docker compose 容器
# 4. 执行本地 healthcheck 与探活

set -euo pipefail

REMOTE_104_HOST="${REMOTE_104_HOST:-192.168.0.104}"
REMOTE_104_USER="${REMOTE_104_USER:-fy}"
REMOTE_104_DIR="${REMOTE_104_DIR:-/home/fy/aistudio-to-api/}"
REMOTE_PORT="${REMOTE_PORT:-8317}"

echo "========================================================"
echo "[INFO] Starting Remote 8317 Deployment to ${REMOTE_104_USER}@${REMOTE_104_HOST}:${REMOTE_104_DIR}"
echo "========================================================"

# 1. 确保前端构建完成
echo "[INFO] Building UI locally..."
npm run build:ui

# 2. 增量 rsync 代码同步
echo "[INFO] Step 1/3: Syncing source code to remote host..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'configs/auth' \
    --exclude 'data' \
    --exclude '.kilo' \
    --exclude 'tests/fixtures' \
    ./ "${REMOTE_104_USER}@${REMOTE_104_HOST}:${REMOTE_104_DIR}"

# 3. 远程执行 Docker 构建与容器重启
echo "[INFO] Step 2/3: Executing remote docker build and compose restart on ${REMOTE_104_HOST}..."
ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_104_USER}@${REMOTE_104_HOST}" "bash -s" << 'EOF'
set -euo pipefail
cd /home/fy/aistudio-to-api

# 保证 .dockerignore 允许包含预构建的 ui/dist
if grep -q "^ui/dist" .dockerignore 2>/dev/null; then
    sed -i '/^ui\/dist/d' .dockerignore
fi

# 采用轻量 Dockerfile 增量层构建
cat << 'DOCKERFILE_EOF' > Dockerfile.update
FROM aistudio-to-api-custom:latest

WORKDIR /app

COPY --chown=node:node main.js ./
COPY --chown=node:node vite.config.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node configs ./configs
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node ui ./ui

EXPOSE 7860

ENV NODE_ENV=production \
    CAMOUFOX_EXECUTABLE_PATH=/app/camoufox-linux/camoufox

CMD ["node", "main.js"]
DOCKERFILE_EOF

echo "[REMOTE] Building Docker image aistudio-to-api-custom:latest..."
docker build -f Dockerfile.update -t aistudio-to-api-custom:latest .
rm -f Dockerfile.update

echo "[REMOTE] Restarting containers via docker compose..."
docker compose down
docker compose up -d
echo "[REMOTE] Docker compose up finished. Container status:"
docker compose ps
EOF

# 4. 健康检查与探活
echo "[INFO] Step 3/3: Running healthcheck and probe..."
sleep 3
bash scripts/dev/healthcheck.sh

echo "========================================================"
echo "[SUCCESS] Remote 8317 deployment completed successfully!"
echo "========================================================"
