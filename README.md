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
  - Compose 创建向导（粘贴/已有文件）、项目启停重启、项目删除
  - 镜像仓库设置（加速器/代理/Insecure Registry）
- 影视管理（Jellyfin API）
  - 继续观看、最近添加、活跃会话
  - 一键触发媒体库刷新
- 下载管理（qBittorrent API）
  - 下载任务列表（状态、进度、速度、ETA）
  - 暂停/继续/删除
  - 添加磁力链接 / 飞牛分享链接 / NAS 种子路径 / 本地种子文件
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
  - 用户配额、存储空间与缓存加速
  - 网卡 IPv4/IPv6 编辑（含可选宿主写入）
  - 远程访问、DDNS、外链分享
  - 共享协议（SMB/WebDAV/FTP/NFS/DLNA）开关与端口
  - 访问端口与强制 HTTPS 登录策略
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
- Web: `http://<服务器IP>:24443`（建议公网改为 `https://<域名>:端口`）
- API Health: `http://<服务器IP>:24443/api/health`

首次初始化：
- 首次访问登录页时，系统会进入“创建管理员”模式。
- 你在页面填写用户名和密码后，自动创建第一个 `admin` 并登录。
- 不再要求先在 `.env` 中填写 `ADMIN_USERNAME/ADMIN_PASSWORD`。

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
- `FORCE_HTTPS_AUTH`：默认 `0`，是否强制 HTTPS 登录（可在设置页改）
- `ALLOW_PLAINTEXT_LOGIN`：默认 `0`，全局明文密码提交开关（一般不建议开启）
  - 当 `FORCE_HTTPS_AUTH=0` 且当前请求为 HTTP 时，系统会自动启用一次“引导兼容登录”兜底（不需要把该变量改为 `1`）
  - 公网场景仍建议开启 `FORCE_HTTPS_AUTH=1`，并通过 HTTPS 访问
- `SEED_ADMIN_FROM_ENV`：默认 `0`。若设置为 `1`，可用 `ADMIN_USERNAME/ADMIN_PASSWORD` 预置管理员（自动化场景）
- `COMPOSE_PROJECTS_DIR`：Compose 向导项目存放目录
- `ARKNAS_ALLOW_HOST_SERVICE_CONTROL`：允许对宿主服务执行 systemctl/service（默认开）
- `ARKNAS_ALLOW_HOST_NETWORK_APPLY`：允许写入宿主网卡（默认开）
- `ARKNAS_HOST_EXEC_MODE`：宿主执行模式，默认 `nsenter`

### 集成变量是否必填
- `JELLYFIN_BASE_URL / JELLYFIN_API_KEY / JELLYFIN_USER_ID`：不是全局必填。
- 仅当你要使用“影视管理”页面的数据拉取（继续观看/最近添加/会话）时必填。
- `QBIT_BASE_URL / QBIT_USERNAME / QBIT_PASSWORD`：不是全局必填。
- 仅当你要使用“下载管理”页面的数据拉取与任务操作时必填。
- 若你通过“应用中心”安装 Jellyfin/qBittorrent，系统会自动写入部分默认地址，但鉴权项（Jellyfin API Key、qB 密码）仍建议在“设置”里补全。
- 当前默认值：
  `JELLYFIN_BASE_URL=http://arknas-jellyfin:8096`
  `QBIT_BASE_URL=http://arknas-qbittorrent:18080`
  `QBIT_USERNAME=admin`
  `QBIT_PASSWORD=adminadmin`

## 安全基线
- 不直接暴露 Docker Socket，默认使用 `docker-socket-proxy`
- 不依赖 80/443/8080，可用高位端口访问
- 关键操作有审计日志
- 登录支持公钥加密提交（默认禁止明文密码字段）
- 建议公网场景叠加 VPN/Zero Trust、WAF、Fail2ban/CrowdSec
- 浏览器 DevTools 的 Network 面板会显示请求体（即使是 HTTPS）；安全性取决于传输链路是否 HTTPS。

## 宿主管理说明
- 系统设置中的 SSH、防火墙、共享协议、网卡配置是“宿主执行”能力，不是容器内模拟开关。
- 默认使用 `nsenter` 模式在宿主命名空间执行命令（`ARKNAS_HOST_EXEC_MODE=nsenter`）。
- `infra/docker-compose.yml` 已为 `api` 服务设置 `pid: host` 与必要能力（`SYS_ADMIN`, `NET_ADMIN`）。
- 若你不希望面板具备宿主执行能力，请将：
  - `ARKNAS_ALLOW_HOST_SERVICE_CONTROL=0`
  - `ARKNAS_ALLOW_HOST_NETWORK_APPLY=0`

## 文档
- 需求说明：`docs/planning/SRS.zh-CN.md`
- PRD：`docs/planning/PRD.zh-CN.md`
- 飞牛功能对照清单：`docs/planning/FNOS-Feature-Checklist.zh-CN.md`
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
