@echo off
chcp 65001 >nul
echo ================================================
echo        阿里云资源平台 - 一键部署脚本
echo ================================================

:: 设置环境变量
set PROJECT_DIR=%~dp0
set DEPLOY_DIR=%PROJECT_DIR%
set BACKEND_DIR=%PROJECT_DIR%backend
set FRONTEND_DIR=%PROJECT_DIR%frontend
set PORT=5001

:: 检查Python是否安装
echo [1/6] 检查Python环境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Python，请先安装Python并添加到环境变量
    pause
    exit /b 1
)
echo ✓ Python已安装

:: 检查Node.js是否安装
echo [2/6] 检查Node.js环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Node.js，请先安装Node.js并添加到环境变量
    pause
    exit /b 1
)
echo ✓ Node.js已安装

:: 安装后端依赖
echo [3/6] 安装后端依赖...
cd %BACKEND_DIR%
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo 错误: 后端依赖安装失败
    pause
    exit /b 1
)
echo ✓ 后端依赖安装完成

:: 安装前端依赖
echo [4/6] 安装前端依赖...
cd %FRONTEND_DIR%
npm install
if %errorlevel% neq 0 (
    echo 错误: 前端依赖安装失败
    pause
    exit /b 1
)
echo ✓ 前端依赖安装完成

:: 构建前端
echo [5/6] 构建前端项目...
npm run build
if %errorlevel% neq 0 (
    echo 错误: 前端构建失败
    pause
    exit /b 1
)
echo ✓ 前端构建完成

:: 检查PM2并启动
echo [6/6] 检查PM2并启动后端...
pm2 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 安装PM2...
    npm install -g pm2
)
echo ✓ PM2已就绪

cd %BACKEND_DIR%
pm2 start ecosystem.config.js

echo.
echo ================================================
echo        部署完成！
echo ================================================
echo.
echo 后端服务: http://localhost:%PORT%
echo 前端开发: cd %FRONTEND_DIR% ^& npm run dev
echo 前端访问: http://localhost:5174
echo.
echo 管理命令:
echo   pm2 status                        # 查看服务状态
echo   pm2 logs aliyun-platform-backend   # 查看后端日志
echo   pm2 restart aliyun-platform-backend # 重启后端
echo.
pause
