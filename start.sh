#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.pids"
mkdir -p logs server/uploads "$PID_DIR"

stop_if_running() {
  local name=$1
  local pid_file="$PID_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "停止旧进程 $name (pid $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi
}

stop_if_running backend
stop_if_running frontend

if [ ! -f client/build/index.html ]; then
  echo "未找到前端构建产物，正在执行 ./deploy.sh ..."
  bash "$ROOT/deploy.sh"
fi

if [ ! -d server/node_modules ]; then
  echo "安装后端依赖..."
  (cd server && npm install --omit=dev)
fi

export TOKEN_SECRET="${TOKEN_SECRET:-couple-album-dev-secret-change-in-production}"
export PORT="${PORT:-3001}"
export FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo "==> 启动后端 (端口 $PORT)"
cd server
nohup node src/app.js > "$ROOT/logs/backend.log" 2>&1 &
echo $! > "$PID_DIR/backend.pid"
cd "$ROOT"

sleep 1
if ! kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
  echo "后端启动失败，查看 logs/backend.log"
  tail -20 logs/backend.log
  exit 1
fi

echo "==> 启动前端静态服务 (端口 $FRONTEND_PORT)"
nohup node scripts/serve-frontend.js > "$ROOT/logs/frontend.log" 2>&1 &
echo $! > "$PID_DIR/frontend.pid"

sleep 1
if ! kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
  echo "前端启动失败，查看 logs/frontend.log"
  tail -20 logs/frontend.log
  exit 1
fi

echo ""
echo "服务已启动"
echo "  前端: http://localhost:${FRONTEND_PORT}"
echo "  后端: http://localhost:${PORT}"
echo "  日志: logs/backend.log  logs/frontend.log"
echo "停止: ./stop.sh"
