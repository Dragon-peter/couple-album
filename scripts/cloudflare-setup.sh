#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_NAME="${DB_NAME:-couple-album-db}"
R2_BUCKET="${R2_BUCKET:-couple-album-uploads}"

echo "==> 检查 Wrangler 登录状态"
npx wrangler whoami >/dev/null

echo "==> 创建或复用 D1: $DB_NAME"
set +e
D1_OUTPUT="$(npx wrangler d1 create "$DB_NAME" 2>&1)"
D1_STATUS=$?
set -e
echo "$D1_OUTPUT"

DATABASE_ID="$(printf '%s\n' "$D1_OUTPUT" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | tail -1)"
if [ -n "$DATABASE_ID" ]; then
  echo "==> 写入 wrangler.toml database_id: $DATABASE_ID"
  node -e "
    const fs = require('fs');
    const file = 'wrangler.toml';
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/database_id = \"[^\"]*\"/, 'database_id = \"$DATABASE_ID\"');
    fs.writeFileSync(file, text);
  "
elif [ "$D1_STATUS" -ne 0 ]; then
  echo "D1 已存在时，Wrangler 不会输出 database_id。请在 Cloudflare Dashboard 或 wrangler d1 list 中复制 ID 到 wrangler.toml。"
fi

echo "==> 创建或复用 R2 bucket: $R2_BUCKET"
if ! npx wrangler r2 bucket create "$R2_BUCKET"; then
  echo ""
  echo "R2 bucket 创建失败。请先在 Cloudflare Dashboard 启用 R2，然后重新运行本脚本。"
  echo "D1 database_id 已尽量写入 wrangler.toml，本次停止以避免半迁移。"
  exit 1
fi

echo "==> 初始化 D1 schema"
npx wrangler d1 execute "$DB_NAME" --remote --file=cloudflare/migrations/0001_schema.sql

echo "==> 生成 JSON/R2 迁移文件"
node scripts/prepare-cloudflare-migration.js

echo "==> 导入 JSON 数据到 D1"
npx wrangler d1 execute "$DB_NAME" --remote --file=cloudflare/generated/seed.sql

echo "==> 上传本地 server/uploads 图片到 R2"
R2_BUCKET="$R2_BUCKET" bash cloudflare/generated/upload-r2.sh

echo ""
echo "Cloudflare 数据资源已准备完成。"
echo "下一步在 Cloudflare Pages 连接 GitHub 仓库，选择 brand-new-version 分支。"
echo "构建命令: cd client && npm ci && npm run build"
echo "输出目录: client/build"
echo "绑定: D1=DB, R2=UPLOADS"
