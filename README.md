# 情侣相册项目部署说明

## 环境要求

- Node.js 16.x 或更高版本
- npm 8.x 或更高版本
- macOS / Linux 或 Windows Server

## 快速部署（macOS / Linux）

```bash
chmod +x deploy.sh start.sh stop.sh
./deploy.sh    # 安装依赖并构建前端
./start.sh     # 启动后端 3001 + 前端静态 3000
./stop.sh      # 停止服务
```

访问：

- 前端页面：http://localhost:3000
- 后端 API：http://localhost:3001

手机同一局域网访问时，将 `localhost` 换成电脑局域网 IP，例如 `http://192.168.1.10:3000`。前端静态服务会代理 `/api` 和 `/uploads`，无需重新硬编码 API 地址。

开发模式（热更新）：

```bash
cd server && npm install && npm start          # 终端 1
cd client && npm install && npm start          # 终端 2，连接 localhost:3001
```

## 生产部署（Windows + Nginx）

1. 将项目复制到 `C:\couple-album`
2. 在本机构建前端：`cd client && npm install && npm run build`（`.env.production` 已配置为同域 API）
3. 在服务器安装 Node 依赖：`cd server && npm install --omit=dev`
4. 配置 Nginx：参考根目录 [`nginx.conf`](nginx.conf)（静态 `client/build`，`/api/` 代理到 `127.0.0.1:3001`，`/uploads/` 指向 `server/uploads`）
5. 设置环境变量后启动后端：`deploy.bat` 或 `start_server.bat`

生产环境务必设置：

```bat
set TOKEN_SECRET=你的随机长密钥
```

## Cloudflare 免费部署（Pages + Functions + D1 + R2）

适合公开访问的小型相册部署：前端由 Cloudflare Pages 托管，`functions/` 目录提供 `/api/*` 和 `/uploads/*`，线上数据写入 D1，图片/头像上传到 R2。

### 1. 创建 Cloudflare 资源

```bash
npm install -g wrangler
wrangler login
wrangler d1 create couple-album-db
wrangler r2 bucket create couple-album-uploads
```

把 `wrangler d1 create` 输出的 `database_id` 填入根目录 `wrangler.toml`。生产环境请在 Cloudflare Pages 的环境变量里设置强随机 `TOKEN_SECRET`，不要使用示例值。

### 2. 初始化 D1 表结构

```bash
wrangler d1 execute couple-album-db --file=cloudflare/migrations/0001_schema.sql
```

### 3. 迁移本地 JSON 和上传文件

```bash
node scripts/prepare-cloudflare-migration.js
wrangler d1 execute couple-album-db --file=cloudflare/generated/seed.sql
bash cloudflare/generated/upload-r2.sh
```

生成目录 `cloudflare/generated/` 默认不提交到 Git。无法识别作者的旧 `unknown` 相册会保留数据，但线上权限会按只读处理。

### 4. Cloudflare Pages 配置

- GitHub 仓库：`zly136688/couple-album`
- 分支：`brand-new-version`
- 构建命令：`cd client && npm ci && npm run build`
- 输出目录：`client/build`
- 环境变量：`REACT_APP_API_URL=SAME_ORIGIN`
- 绑定：D1 绑定名 `DB`，R2 绑定名 `UPLOADS`

前端生产环境使用同源接口，不需要硬编码 API 域名。Pages 部署后，手机和桌面访问同一个公开 URL 即可。

## 目录结构

```
couple-album/
  ├── client/           # 前端 React 项目
  ├── server/           # 后端 Express
  ├── functions/        # Cloudflare Pages Functions API
  ├── cloudflare/       # D1 schema 与迁移输出目录
  ├── scripts/          # serve-frontend.js 等
  ├── albums.json       # 相册数据
  ├── users.json        # 用户数据
  ├── deploy.sh         # macOS/Linux 构建
  ├── start.sh          # macOS/Linux 启动
  ├── deploy.bat        # Windows 仅启动后端（前端由 Nginx 提供）
  └── nginx.conf        # Nginx 示例配置
```

## 注意事项

- 上传目录：`server/uploads/`（需可写）
- Nginx `client_max_body_size` 建议 ≥ 100M（与后端 multer 限制一致）
- 旧版明文密码用户仍可登录，首次登录成功后会自动迁移为哈希密码
- `creatorId` / `creatorAccount` 缺失的旧数据会在启动时尽量按用户名补齐，无法识别的 `unknown` 相册会保持只读状态
- 首次构建需联网下载 npm 依赖
- 日志：`logs/backend.log`、`logs/frontend.log`

## 故障排除

1. 端口占用：`lsof -i :3000` / `lsof -i :3001`（macOS）或 `netstat -ano | findstr :3001`（Windows）
2. 前端白屏：确认已执行 `client` 目录下的 `npm run build`
3. 图片无法显示：检查 Nginx `/uploads/` 别名路径与 `server/uploads` 一致
4. API 401：重新登录；生产环境检查 `TOKEN_SECRET` 是否变更导致旧 token 失效 
