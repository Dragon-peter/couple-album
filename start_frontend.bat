@echo off
chcp 65001 >nul
echo 启动前端服务...

:: 设置工作目录
cd /d "%~dp0"

:: 设置Node.js路径
set NODE_PATH=C:\BtSoft\pm2\18.6.0\node.exe

:: 检查日志目录
if not exist "logs" mkdir logs

:: 进入client目录
cd client

:: 使用http-server启动前端（如果存在）
if exist "..\node_modules\.bin\http-server.cmd" (
  echo 使用http-server启动前端...
  start cmd /k "..\node_modules\.bin\http-server.cmd build -p 3000 -c-1"
) else (
  :: 使用内置Node.js HTTP模块创建简单服务器
  echo 使用Node.js内置HTTP模块启动前端...
  start cmd /k "%NODE_PATH% -e \"const http=require('http');const fs=require('fs');const path=require('path');const port=3000;const server=http.createServer((req,res)=>{let filePath='./build'+req.url;if(filePath==='./build/'){filePath='./build/index.html';}const extname=path.extname(filePath);let contentType='text/html';switch(extname){case '.js':contentType='text/javascript';break;case '.css':contentType='text/css';break;case '.json':contentType='application/json';break;case '.png':contentType='image/png';break;case '.jpg':contentType='image/jpg';break;}fs.readFile(filePath,(err,content)=>{if(err){if(err.code==='ENOENT'){fs.readFile('./build/index.html',(err,content)=>{if(err){res.writeHead(500);res.end('Error loading index.html');}else{res.writeHead(200,{'Content-Type':'text/html'});res.end(content);}});}else{res.writeHead(500);res.end('Server Error: '+err.code);}}else{res.writeHead(200,{'Content-Type':contentType});res.end(content);}});});server.listen(port,()=>{console.log('前端服务已启动: http://localhost:'+port);});\""
)

echo.
echo 前端服务应该已启动
echo 访问地址：http://localhost:3000
echo.
echo 如果需要通过IP访问，请使用您的本地IP地址

pause 