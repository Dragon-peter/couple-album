#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> 情侣相册 - 构建部署包"
echo "项目目录: $ROOT"

mkdir -p logs server/uploads

echo "==> 安装后端依赖"
cd server
npm install --omit=dev
cd "$ROOT"

echo "==> 安装前端依赖并构建"
cd client
npm install
npm run build
cd "$ROOT"

if [ ! -f client/build/index.html ]; then
  echo "错误: 前端构建失败，未找到 client/build/index.html"
  exit 1
fi

echo ""
echo "构建完成。"
echo "启动服务: ./start.sh"
echo "生产服务器 (Windows + Nginx): 将项目复制到 C:/couple-album 后运行 deploy.bat，并配置 nginx.conf"
