# 发布与回滚手册

## 1. 发布前检查
- 已拉取最新 `main`
- `.env` 已设置强密码和生产参数
- `CLOUDFLARE_API_TOKEN` 为最小权限 Token
- 服务器已开放目标公网端口（默认 `24443`）

## 2. 发布步骤
```bash
git pull
cp .env.example .env   # 首次部署时
make up
make ps
```

健康检查：
- `http://<server-ip>:24443/api/health`

## 3. 回滚步骤
### 3.1 代码回滚
```bash
git log --oneline
git checkout <previous-commit>
make restart
```

### 3.2 数据回滚
先执行备份恢复脚本：
```bash
./scripts/restore.sh ./backups/<backup-file>.tar.gz --yes
make up
```

## 4. 备份策略
建议每天执行：
```bash
./scripts/backup.sh
```

备份内容：
- `data/`（SQLite、证书）
- `infra/docker-compose.yml`
- `docs/`
- `.env`（如果存在）

## 5. 故障排查
- 查看容器状态：`make ps`
- 查看日志：`make logs`
- API 冒烟：`./scripts/smoke-api.sh`
- compose 校验：`docker compose -f infra/docker-compose.yml config`

## 6. 安全应急
- 立即修改管理密码与 JWT 密钥
- 轮换 Cloudflare API Token
- 暂停公网入口（关闭端口或停 web 容器）
- 复核审计日志并回放关键操作
