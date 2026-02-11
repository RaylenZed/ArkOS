# 方舟 NAS 中控台（ArkNAS Hub）

基于 Debian + Docker 的 NAS 统一管理面板，聚合 Docker、Jellyfin、qBittorrent，支持 Cloudflare DNS 自动 SSL 管理与安全公网访问。

## 功能概览
- 统一总览 Dashboard
  - 容器运行统计（总数/运行/停止/异常）
  - Jellyfin 活跃播放、继续观看、最近添加
  - qBittorrent 下载状态与实时速率
  - CPU/内存/磁盘/网络状态
- 容器管理
  - 容器列表、端口映射、状态
  - 启动/停止/重启
  - 最近日志查看
  - 拉取镜像与可选重建更新
- 影视管理（Jellyfin API）
  - 继续观看、最近添加、活跃会话
  - 一键触发媒体库刷新
- 下载管理（qBittorrent API）
  - 下载任务列表（状态、进度、速度、ETA）
  - 暂停/继续/删除
  - 添加磁力链接
- 应用中心（面板内安装）
  - 一键安装 Jellyfin / qBittorrent / Portainer / Watchtower
  - 一键安装“影视套件”（Jellyfin + qBittorrent + Watchtower）
  - 启动/停止/重启/卸载
  - 任务中心（进度条、状态、失败原因、任务日志、失败重试、重试来源）
  - 安装/重启后自动验收（容器状态 + 服务就绪检测）
  - 支持在设置页配置安装目录和端口
- SSL 管理面板
  - Cloudflare DNS Challenge 签发证书
  - 证书续期、路由绑定、下载
  - 自动续期任务（每天 03:00，临近到期自动续签）
- 设置与安全
  - 集成配置页面（Jellyfin/qB）
  - 审计日志（登录、容器、下载、SSL、设置变更）

## 项目结构
```text
.
├── apps
│   ├── api
│   └── web
├── docs
│   ├── planning
│   └── process
├── infra
│   └── docker-compose.yml
├── .env.example
└── Makefile
```

## 快速开始
### 1) 准备环境
- Docker / Docker Compose
- Debian/Ubuntu/macOS 均可（建议 Linux 服务器）

### 2) 配置环境变量
```bash
cp .env.example .env
```

至少修改：
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `CLOUDFLARE_API_TOKEN`（如果需要 SSL 签发）

### 3) 启动
```bash
make up
```

如果服务器没有 `make`：
```bash
./scripts/manage.sh up
```

### 4) 访问
- Web: `http://<服务器IP>:24443`
- API Health: `http://<服务器IP>:24443/api/health`

默认登录：
- 用户名：`.env` 的 `ADMIN_USERNAME`
- 密码：`.env` 的 `ADMIN_PASSWORD`

说明：
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` 只在首次初始化数据库时生效。
- 后续若改了 `.env`，不会自动覆盖已有数据库用户密码。

## 关键配置说明
- `PUBLIC_PORT`：对外端口（默认 `24443`）
- `DOCKER_HOST`：已默认走 `docker-socket-proxy`
- `JELLYFIN_*`：影视模块配置
- `QBIT_*`：下载模块配置
- `MEDIA_PATH` / `DOWNLOADS_PATH` / `DOCKER_DATA_PATH`：应用中心安装目录
- `JELLYFIN_HOST_PORT` / `QBIT_WEB_PORT` / `QBIT_PEER_PORT`：应用中心安装端口
- `PORTAINER_HOST_PORT`：Portainer 端口
- `WATCHTOWER_INTERVAL`：Watchtower 轮询秒数
- `ARKNAS_INTERNAL_NETWORK`：应用中心容器接入的内部网络名
- `CLOUDFLARE_API_TOKEN`：SSL 签发必须
- `ACME_EMAIL`：证书通知邮箱（建议填写）

## 安全基线
- 不直接暴露 Docker Socket，默认使用 `docker-socket-proxy`
- 不依赖 80/443/8080，可用高位端口访问
- 关键操作有审计日志
- 建议公网场景叠加 VPN/Zero Trust、WAF、Fail2ban/CrowdSec

## 文档
- 需求说明：`docs/planning/SRS.zh-CN.md`
- PRD：`docs/planning/PRD.zh-CN.md`
- 公网部署方案：`docs/planning/Deployment-Security.zh-CN.md`
- 开发 TODO：`docs/process/TODO.md`
- 开发规范：`docs/process/DEVELOPMENT-WORKFLOW.md`
- 发布与回滚：`docs/process/RELEASE-RUNBOOK.md`

## 命令
```bash
make up        # 启动
make down      # 停止
make restart   # 重建重启
make ps        # 查看服务状态
make logs      # 跟踪日志
make backup    # 执行备份
make restore BACKUP=./backups/<file>.tar.gz  # 恢复备份
make check     # 语法与compose校验
make test      # 运行API测试
make smoke     # API冒烟测试
./scripts/manage.sh up     # 无make环境启动
./scripts/manage.sh ps     # 无make环境查看状态
./scripts/manage.sh logs   # 无make环境查看日志
./scripts/manage.sh reset-admin-password '<新密码>' [用户名]  # 重置本地数据库密码
cd apps/api && npm run check  # 无make环境语法检查
cd apps/api && npm test       # 无make环境运行测试
./scripts/smoke-api.sh        # 无make环境冒烟测试
```

## 备份与恢复
备份：
```bash
./scripts/backup.sh
```

恢复（会先停止服务）：
```bash
./scripts/restore.sh ./backups/<backup-file>.tar.gz --yes
make up
```

## 注意事项
- 容器“更新”默认先拉镜像；若选择“重建更新”会尝试以当前配置重建容器。
- 对于复杂 Compose 项目，建议仍优先使用原始 Compose 工作流更新。

## License
待补充（建议 MIT）。
