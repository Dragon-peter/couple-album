@echo off
chcp 65001 >nul
echo 启动情侣相册后端服务...
cd /d "%~dp0"
cd server
"C:\BtSoft\pm2\18.6.0\node.exe" src\app.js
pause