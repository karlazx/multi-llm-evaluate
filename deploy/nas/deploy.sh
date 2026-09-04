#!/bin/bash
# ═══════════════════════════════════════════════════════
# 大模型评测平台 — NAS 一键部署脚本
# 在 NAS 上执行: bash deploy.sh
# ═══════════════════════════════════════════════════════

set -e

DEPLOY_DIR="/docker/mle"
echo "📦 大模型评测平台 NAS 部署"
echo "=========================="

# 1. 创建目录结构
echo "[1/6] 创建目录结构..."
mkdir -p "$DEPLOY_DIR/data/pg"
mkdir -p "$DEPLOY_DIR/data/snapshots"

# 2. 检查 .env 文件
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    echo "[!] 请先配置 .env 文件："
    echo "    cp .env.example $DEPLOY_DIR/.env"
    echo "    然后编辑 $DEPLOY_DIR/.env 填入真实值"
    exit 1
fi
echo "[2/6] .env 文件已就绪 ✓"

# 3. 复制 docker-compose.yml
cp docker-compose.yml "$DEPLOY_DIR/"
echo "[3/6] docker-compose.yml 已复制 ✓"

# 4. 生成 ENCRYPTION_KEY（如果为空）
cd "$DEPLOY_DIR"
source .env 2>/dev/null || true
if [ -z "$ENCRYPTION_KEY" ]; then
    echo "[4/6] 生成 ENCRYPTION_KEY..."
    NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || \
              openssl rand -hex 32)
    sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$NEW_KEY/" .env
    echo "    ENCRYPTION_KEY=$NEW_KEY"
else
    echo "[4/6] ENCRYPTION_KEY 已配置 ✓"
fi

# 5. 登录 GHCR 并拉取镜像
echo "[5/6] 拉取镜像..."
if [ -z "$GH_PAT" ]; then
    echo "[!] 请输入 GitHub PAT（有 read:packages 权限）："
    read -s GH_PAT
fi
echo "$GH_PAT" | docker login ghcr.io -u karlazx --password-stdin
docker pull ghcr.io/karlazx/multi-llm-evaluate:latest

# 6. 启动服务
echo "[6/6] 启动服务..."
docker compose up -d

echo ""
echo "=========================="
echo "✅ 部署完成！"
echo ""
echo "📋 检查状态: docker compose ps"
echo "📋 查看日志: docker compose logs -f app"
echo "📋 健康检查: curl http://localhost:8788/api/health"
echo ""
echo "🌐 访问地址: http://192.168.31.251:8788"
echo ""
echo "⚠️  下一步："
echo "  1. 录入种子用例: docker exec mle-app npx tsx server/src/seed.ts"
echo "  2. 打开浏览器访问上述地址"
echo "  3. 在「模型管理」页面录入模型（参考 Ubuntu 的配置）"
