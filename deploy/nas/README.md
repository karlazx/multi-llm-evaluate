# NAS 部署（极空间 Z4Pro）

与云服务器部署（仓库根 `Dockerfile` + GitHub Actions）不同，NAS 部署跑在家庭局域网内，
使用双容器：**mle-app（本应用）+ mle-postgres（PostgreSQL 16）**，Web 端口 `8788`。

GitHub Actions 无法触达内网 NAS，部署/更新需在局域网机器（Mac）或 NAS 上手动执行：

```bash
# 首次部署
cp .env.example .env   # 填入 PG_PASSWORD / 模型 API key（GH_PAT 交互式输入或写入 .env）
# 把本目录（deploy.sh + docker-compose.yml + .env）拷到 NAS 的 /docker/mle 后：
bash deploy.sh

# 更新（拉取 latest 镜像并重启）
cd /docker/mle && docker compose pull app && docker compose up -d app
```

部署完成后首次需初始化数据：

```bash
docker exec mle-app node server/dist/seed.js   # 录入 6 个种子用例
# 模型在「模型接入」页手动录入（参考 docs/assets/模型单价清单.md 的单价）
```

> NAS 上 PG 已改为共享实例（供其他项目复用），连接方式等运维细节见内部文档
> （真实凭据不入仓库，存于仓库目录内 gitignore 屏蔽的 `private/` 下）。
