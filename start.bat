@echo off
chcp 65001 >nul
echo 情侣相册项目启动脚本
echo =====================

:: 设置工作目录
cd /d "%~dp0"

:: 设置Node.js路径
set NODE_PATH=C:\BtSoft\pm2\18.6.0\node.exe

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
start /b cmd /c "chcp 65001 >nul && %NODE_PATH% src\app.js > ..\logs\backend.log 2>&1"

:: 等待后端启动并检查是否成功
timeout /t 5 /nobreak > nul
netstat -ano | findstr ":3001" > nul
if %errorlevel% neq 0 (
    echo 后端服务启动失败，请检查logs\backend.log
    exit /b 1
)
echo 后端服务启动成功！

:: 启动前端服务 - 使用React自带的启动方法
echo 正在启动前端服务...
cd ..\client
start /b cmd /c "chcp 65001 >nul && cd build && %NODE_PATH% -e \"require('http').createServer(function(req,res){const fs=require('fs');const path=require('path');let filePath='.'+req.url;if(filePath==='./'){filePath='./index.html';}fs.readFile(filePath,function(err,data){if(err){res.writeHead(200);res.end(fs.readFileSync('./index.html'));}else{res.writeHead(200);res.end(data);}});}).listen(3000);console.log('前端服务已启动: http://localhost:3000');\" > ..\logs\frontend.log 2>&1"

:: 等待前端启动并检查是否成功
timeout /t 5 /nobreak > nul
netstat -ano | findstr ":3000" > nul
if %errorlevel% neq 0 (
    echo 前端服务启动失败，请检查logs\frontend.log
    exit /b 1
)
echo 前端服务启动成功！

echo.
echo 服务已启动！
echo 前端访问地址：http://localhost:3000
echo 后端访问地址：http://localhost:3001
echo 如果需要通过IP访问，请使用您的本地IP地址
echo 如果遇到访问问题，请检查 logs 目录下的日志文件

:: 保持窗口打开以便查看日志
pause 