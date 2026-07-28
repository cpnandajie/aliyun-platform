# 阿里云资源与账单管理平台

一站式阿里云多账号资源管理、账单分析、域名管理、RAM 用户管理、SSL 证书管理和云监控平台。

## 功能模块

### 资源概览
- 汇总展示所有账号的 ECS、RDS、SLB、OSS、Redis 实例数量
- 本月消费和可用额度实时统计
- 低余额预警（低于 2 万自动标红）
- 各账号资源分布一目了然

### 资源管理
- 多账号资源统一视图
- 支持按账号、地域筛选
- 实例详情查看（IP、状态、规格、到期时间等）
- 数据同步（全量同步/仅资源/仅账单）

### 账单管理
- 月度账单查询
- 历史账单对比
- 按账号筛选
- 消费趋势分析

### 账号管理
- 多账号 AccessKey 管理
- 阿里云账号 ID 自动获取（通过 STS API）
- 自动同步配置（可设置同步间隔）
- 数据备份机制

### RAM 管理
- RAM 用户列表查看
- 用户创建/删除
- 密码重置
- AccessKey 管理
- 权限策略附加/移除
- 支持按用户名、显示名、AccessKey ID 搜索

### 域名管理
- 域名列表展示（按持有者筛选）
- 域名到期提醒
- 解析记录管理（增删改查）
- 解析记录分页显示（每页 20 条）
- 支持按主机记录、记录值搜索
- 快速跳转至解析记录

### SSL 证书管理
- 证书列表查看
- 证书到期监控
- 证书详情（域名、颁发机构、有效期）

### 云监控
- 活跃告警查询
- 历史告警查看
- 多账号告警统一视图
- 按规则名称、命名空间、资源筛选

### 日志管理
- 操作日志记录（除查询外的所有操作）
- 支持按账号、模块、关键词、时间范围筛选
- 分页展示
- 日志清空功能（需手动开启）

## 技术栈

### 前端
- **React 18** - UI 框架
- **React Router 6** - 路由管理
- **Vite 5** - 构建工具
- **Axios** - HTTP 请求

### 后端
- **Flask 2.3** - Web 框架
- **SQLite** - 数据库
- **APScheduler** - 定时任务调度
- **阿里云 SDK** - 资源同步与操作
  - ECS、RDS、SLB、Redis、OSS
  - BSS（账单）
  - RAM（访问控制）
  - DNS（域名解析）
  - CAS（SSL 证书）
  - CMS（云监控）
  - STS（账号 ID 获取）

### 部署
- **PM2** - 进程管理
- **Nginx**（可选）- 反向代理

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- npm 或 yarn

### 一键部署（Windows）

```bash
# 双击运行
start.bat
```

脚本会自动：
1. 检查 Python 和 Node.js 环境
2. 安装后端依赖（pip install）
3. 安装前端依赖（npm install）
4. 构建前端项目（npm run build）
5. 检查并安装 PM2
6. 启动后端服务

### 手动部署

#### 1. 后端部署

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 启动服务（开发模式）
python app.py

# 或使用 PM2（生产环境）
pm2 start ecosystem.config.js
```

后端默认运行在 `http://localhost:5001`

#### 2. 前端部署

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

开发模式访问 `http://localhost:5174`  
生产构建后由后端静态文件服务托管

### 配置阿里云账号

1. 访问 `http://localhost:5001`（或你的部署地址）
2. 进入 **账号管理** 页面
3. 点击 **添加账号**
4. 填写：
   - 账号名称（自定义）
   - AccessKey ID
   - AccessKey Secret
   - 备注（可选）
5. 点击 **同步全部** 开始同步资源

### 启用自动同步

1. 进入 **账号管理** 页面
2. 在 **自动同步** 区域：
   - 点击 **启用自动同步**
   - 设置同步间隔（1-24 小时）
3. 系统将按设定间隔自动同步所有账号数据

## 项目结构

```
aliyun-platform/
├── backend/
│   ├── app.py              # Flask 后端主文件
│   ├── requirements.txt    # Python 依赖
│   └── ecosystem.config.js # PM2 配置
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # React 主组件
│   │   ├── App.css        # 全局样式
│   │   └── main.jsx       # 入口文件
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── start.bat              # Windows 一键部署脚本
└── start.sh               # Linux/Mac 一键部署脚本
```

## 数据库

使用 SQLite 数据库，首次启动时自动创建。

主要数据表：
- `accounts` - 账号信息
- `ecs_instances` - ECS 实例
- `rds_instances` - RDS 实例
- `slb_instances` - SLB 实例
- `redis_instances` - Redis 实例
- `oss_buckets` - OSS Bucket
- `monthly_bills` - 月度账单
- `account_balance` - 账号余额
- `operation_logs` - 操作日志
- `auto_sync_config` - 自动同步配置

数据库文件位置：`backend/aliyun_platform.db`

## 常用命令

```bash
# 查看 PM2 服务状态
pm2 status

# 查看后端日志
pm2 logs aliyun-platform-backend

# 重启后端
pm2 restart aliyun-platform-backend

# 停止后端
pm2 stop aliyun-platform-backend

# 前端开发
cd frontend && npm run dev

# 前端构建
cd frontend && npm run build
```

## 安全建议

1. **AccessKey 安全**
   - 使用 RAM 子账号的 AccessKey，避免使用主账号
   - 为 AccessKey 设置最小权限（只读权限即可满足资源同步）
   - 定期轮换 AccessKey

2. **访问控制**
   - 生产环境建议配置 Nginx 反向代理
   - 可添加 HTTP Basic Auth 或其他认证机制
   - 限制访问 IP 白名单

3. **数据备份**
   - 系统自动备份数据库（保留 7 天）
   - 备份目录：`backend/backups/`
   - 建议定期将备份文件转移至其他存储

## 故障排查

### 后端启动失败
```bash
# 查看错误日志
pm2 logs aliyun-platform-backend --lines 100

# 检查端口占用
netstat -ano | findstr 5001
```

### 前端构建失败
```bash
# 清除缓存重新安装
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 同步失败
- 检查 AccessKey 是否正确
- 检查账号是否开通了相关服务
- 查看后端日志获取详细错误信息

## 许可证

本项目仅供学习和内部使用。

## 联系方式

如有问题或建议，请联系开发团队。
