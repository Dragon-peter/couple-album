echo @echo off > server_start.bat
echo chcp 65001 ^>nul >> server_start.bat
echo echo 情侣相册项目服务器启动脚本 >> server_start.bat
echo echo ======================== >> server_start.bat
echo. >> server_start.bat
echo :: 设置工作目录 >> server_start.bat
echo cd /d "%%~dp0" >> server_start.bat
echo. >> server_start.bat
echo :: 设置Node.js路径 >> server_start.bat
echo set NODE_PATH=C:\BtSoft\pm2\18.6.0\node.exe >> server_start.bat
echo. >> server_start.bat
echo :: 检查Node.js是否存在 >> server_start.bat
echo if not exist "%%NODE_PATH%%" ( >> server_start.bat
echo     echo 错误: 找不到Node.js执行文件: %%NODE_PATH%% >> server_start.bat
echo     echo 请确认Node.js安装路径，并修改脚本中的NODE_PATH变量 >> server_start.bat
echo     pause >> server_start.bat
echo     exit /b 1 >> server_start.bat
echo ) >> server_start.bat
echo. >> server_start.bat
echo :: 检查日志目录 >> server_start.bat
echo if not exist "logs" mkdir logs >> server_start.bat
echo. >> server_start.bat
echo :: 检查上传目录 >> server_start.bat
echo if not exist "server\uploads" mkdir server\uploads >> server_start.bat
echo. >> server_start.bat
echo :: 检查并终止已存在的Node.js进程 >> server_start.bat
echo taskkill /F /IM node.exe /T 2^>nul >> server_start.bat
echo timeout /t 2 /nobreak ^> nul >> server_start.bat
echo. >> server_start.bat
echo :: 启动后端服务 >> server_start.bat
echo echo 正在启动后端服务... >> server_start.bat
echo cd server >> server_start.bat
echo start cmd /k "%%NODE_PATH%%" src\app.js >> server_start.bat
echo. >> server_start.bat
echo echo. >> server_start.bat
echo echo 后端服务已启动！ >> server_start.bat
echo echo Nginx应该已经配置为提供前端静态文件 >> server_start.bat
echo echo 通过浏览器访问 http://47.96.103.73 即可 >> server_start.bat
echo. >> server_start.bat
echo pause >> server_start.bat