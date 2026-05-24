#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT/.pids"

for name in frontend backend; do
  pid_file="$PID_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "已停止 $name (pid $pid)"
    fi
    rm -f "$pid_file"
  fi
done

echo "完成"
