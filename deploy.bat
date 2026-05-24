@echo off
chcp 65001 >nul
echo 情侣相册项目服务器启动脚本
echo ========================

:: 设置工作目录
cd /d "%~dp0"

:: 设置Node.js路径
set NODE_PATH=C:\BtSoft\pm2\18.6.0\node.exe

:: 检查Node.js是否存在
if not exist "%NODE_PATH%" (
    echo 错误: 找不到Node.js执行文件: %NODE_PATH%
    echo 请确认Node.js安装路径，并修改脚本中的NODE_PATH变量
    pause
    exit /b 1
)

:: 检查日志目录
if not exist "logs" mkdir logs

:: 检查上传目录
if not exist "server\uploads" mkdir server\uploads

:: 检查并终止已存在的Node.js进程
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak > nul

:: 启动后端服务
echo 正在启动后端服务...
cd server
start cmd /k "%NODE_PATH%" src\app.js

echo.
echo 后端服务已启动！
echo Nginx应该已经配置为提供前端静态文件
echo 通过浏览器访问 http://47.96.103.73 即可

pause 