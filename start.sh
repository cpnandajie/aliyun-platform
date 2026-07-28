#!/bin/bash
set -e

echo "================================================"
echo "       阿里云资源平台 - 一键部署脚本"
echo "================================================"

# 设置路径
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR="/home/aliyun-platform"
BACKEND_DIR="$DEPLOY_DIR/backend"
FRONTEND_DIR="$DEPLOY_DIR/frontend"
PORT=5001

echo "[1/7] 同步项目文件到 $DEPLOY_DIR ..."
mkdir -p $BACKEND_DIR $FRONTEND_DIR
# 如果项目目录就是部署目录，跳过复制
if [ "$(cd "$PROJECT_DIR" && pwd)" != "$(cd "$DEPLOY_DIR" 2>/dev/null && pwd)" ]; then
    cp -r $PROJECT_DIR/backend/* $BACKEND_DIR/
    cp -r $PROJECT_DIR/frontend/* $FRONTEND_DIR/
    echo "✓ 文件同步完成"
else
    echo "✓ 项目已在部署目录，跳过复制"
fi

# 检查Python3是否安装
echo "[2/7] 检查Python3环境..."
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请先安装Python3"
    exit 1
fi
echo "✓ Python3已安装"

# 检查Node.js是否安装
echo "[3/7] 检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js"
    exit 1
fi
echo "✓ Node.js已安装"

# 安装后端依赖
echo "[4/7] 安装后端依赖..."
cd "$BACKEND_DIR"
pip3 install -r requirements.txt
echo "✓ 后端依赖安装完成"

# 安装前端依赖
echo "[5/7] 安装前端依赖..."
cd "$FRONTEND_DIR"
npm install
echo "✓ 前端依赖安装完成"

# 构建前端
echo "[6/7] 构建前端项目..."
npm run build
echo "✓ 前端构建完成"

# 检查PM2并启动后端
echo "[7/7] 启动后端服务..."
if ! command -v pm2 &> /dev/null; then
    echo "安装PM2..."
    npm install -g pm2
fi

cd "$BACKEND_DIR"
# 如果已有同名进程先删除
pm2 delete aliyun-platform-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "================================================"
echo "       部署完成！"
echo "================================================"
echo ""
echo "后端服务: http://localhost:$PORT"
echo "前端开发: cd $FRONTEND_DIR && npm run dev"
echo "前端访问: http://localhost:5174"
echo ""
echo "管理命令:"
echo "  pm2 status                      # 查看服务状态"
echo "  pm2 logs aliyun-platform-backend  # 查看后端日志"
echo "  pm2 restart aliyun-platform-backend  # 重启后端"
echo "  pm2 stop aliyun-platform-backend     # 停止后端"
