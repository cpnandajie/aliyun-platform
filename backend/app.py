from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import json
import traceback
from datetime import datetime
import threading
import sys
import logging
import warnings
from apscheduler.schedulers.background import BackgroundScheduler
# 强制stdout无缓冲
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
# 适配Python 3.12+的datetime序列化，消除DeprecationWarning
warnings.filterwarnings('ignore', category=DeprecationWarning, message='.*datetime adapter.*')
def _adapt_datetime(dt):
    return dt.isoformat()
sqlite3.register_adapter(datetime, _adapt_datetime)

app = Flask(__name__)
CORS(app)

# ==================== 全局错误处理 ====================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'success': False, 'error': '接口不存在', 'code': 404}), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({'success': False, 'error': '服务器内部错误', 'code': 500}), 500


@app.errorhandler(401)
def unauthorized(e):
    return jsonify({'success': False, 'error': '未授权访问', 'code': 401}), 401


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'success': False, 'error': '请求方法不允许', 'code': 405}), 405

# ==================== 同步任务过期清理 ====================

def cleanup_sync_tasks():
    """清理完成超过 1 小时的同步任务"""
    now = datetime.now()
    removed = 0
    with sync_tasks_lock:
        expired_keys = []
        for task_id, task in sync_tasks.items():
            completed_at = task.get('completed_at')
            if completed_at:
                try:
                    ct = datetime.strptime(completed_at, '%Y-%m-%d %H:%M:%S')
                    if (now - ct).total_seconds() > 3600:
                        expired_keys.append(task_id)
                except ValueError:
                    pass
            # 同时清理长时间处于running 状态（超过 2 小时）的僵尸任务
            started_at = task.get('started_at')
            if task.get('status') == 'running' and started_at:
                try:
                    st = datetime.strptime(started_at, '%Y-%m-%d %H:%M:%S')
                    if (now - st).total_seconds() > 7200:
                        task['error'] = '任务超时自动标记为失败'
                        task['completed_at'] = now.strftime('%Y-%m-%d %H:%M:%S')
                except ValueError:
                    pass
        for key in expired_keys:
            del sync_tasks[key]
            removed += 1
        app.logger.info(f'[清理] 已清理 {removed} 个过期同步任务')
# 数据库配置
DB_PATH = '/home/aliyun-platform/backend/aliyun_platform.db'
# 确保数据库目录存在
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
# 备份目录
BACKUP_DIR = os.path.join(os.path.dirname(DB_PATH), 'backups')
os.makedirs(BACKUP_DIR, exist_ok=True)
# 同步任务状态跟踪（内存字典，key=task_id）
sync_tasks = {}
sync_tasks_lock = threading.Lock()
# 默认的阿里云区域
DEFAULT_REGIONS = [
    'cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-chengdu',
    'ap-southeast-1'
]


# ==================== 数据库初始化 ====================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # 账号表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            access_key_id TEXT NOT NULL,
            access_key_secret TEXT NOT NULL,
            remark TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # ECS实例表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ecs_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            instance_id TEXT NOT NULL,
            instance_name TEXT,
            status TEXT,
            instance_type TEXT,
            cpu INTEGER,
            memory INTEGER,
            os_type TEXT,
            private_ip TEXT,
            public_ip TEXT,
            region_id TEXT,
            created_time TEXT,
            expired_time TEXT,
            renewal_price REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')
    # RDS实例表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rds_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            instance_id TEXT NOT NULL,
            instance_name TEXT,
            engine TEXT,
            engine_version TEXT,
            instance_type TEXT,
            instance_cpu TEXT,
            instance_memory TEXT,
            status TEXT,
            region_id TEXT,
            connection_mode TEXT,
            created_time TEXT,
            expired_time TEXT,
            renewal_price REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')
    # SLB实例表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS slb_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            instance_id TEXT NOT NULL,
            instance_name TEXT,
            address TEXT,
            address_type TEXT,
            status TEXT,
            network_type TEXT,
            region_id TEXT,
            created_time TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')
    # OSS Bucket表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS oss_buckets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            bucket_name TEXT NOT NULL,
            location TEXT,
            storage_class TEXT,
            creation_date TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')
    # Redis实例表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS redis_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            instance_id TEXT NOT NULL,
            instance_name TEXT,
            instance_type TEXT,
            engine_version TEXT,
            architecture_type TEXT,
            capacity TEXT,
            status TEXT,
            region_id TEXT,
            connection_domain TEXT,
            port INTEGER,
            created_time TEXT,
            expired_time TEXT,
            renewal_price REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')

    # 月账单表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS monthly_bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            billing_cycle TEXT NOT NULL,
            total_amount REAL DEFAULT 0,
            details TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, billing_cycle),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')
    # 账号余额表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS account_balance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            available_amount REAL DEFAULT 0,
            available_cash REAL DEFAULT 0,
            credit_amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'CNY',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    ''')

    conn.commit()
    conn.close()
    # 创建auto_sync_config表（后续版本新增）
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS auto_sync_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            enabled INTEGER DEFAULT 0,
            interval_hours INTEGER DEFAULT 6,
            last_sync_at TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 插入默认配置
    cursor.execute('INSERT OR IGNORE INTO auto_sync_config (id, enabled, interval_hours) VALUES (1, 0, 6)')
    conn.commit()
    conn.close()
    # 创建默认区域表
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS default_regions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            region_id TEXT NOT NULL UNIQUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 插入默认区域（仅在表为空时）
    cursor.execute('SELECT COUNT(*) FROM default_regions')
    if cursor.fetchone()[0] == 0:
        default_regions_list = ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-chengdu', 'ap-southeast-1']
        for i, region in enumerate(default_regions_list):
            cursor.execute('INSERT INTO default_regions (region_id, sort_order) VALUES (?, ?)', (region, i))
    conn.commit()
    conn.close()
    # 创建操作日志表
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS operation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            account_name TEXT,
            module TEXT,
            action TEXT,
            detail TEXT,
            success INTEGER DEFAULT 1,
            error_msg TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at)')
    conn.commit()
    conn.close()
    # 检查accounts表有last_sync_at列（后续版本新增）
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(accounts)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'last_sync_at' not in columns:
            cursor.execute('ALTER TABLE accounts ADD COLUMN last_sync_at TEXT')
        if 'aliyun_account_id' not in columns:
            cursor.execute('ALTER TABLE accounts ADD COLUMN aliyun_account_id TEXT')
        if 'aliyun_account_name' not in columns:
            cursor.execute('ALTER TABLE accounts ADD COLUMN aliyun_account_name TEXT')
        conn.commit()
        conn.close()
    except Exception:
        pass
    # 检查ecs/rds/redis表有renewal_price列
    for table in ['ecs_instances', 'rds_instances', 'redis_instances']:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in cursor.fetchall()]
            if 'renewal_price' not in columns:
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN renewal_price REAL')
            conn.commit()
            conn.close()
        except Exception:
            pass

init_db()

# ==================== 数据库辅助函数 ====================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def query_db(sql, args=(), one=False):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(sql, args)
    result = cursor.fetchone() if one else cursor.fetchall()
    conn.close()
    return result


def execute_db(sql, args=()):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(sql, args)
    conn.commit()
    last_id = cursor.lastrowid
    conn.close()
    return last_id


def log_operation(module, action, detail='', account_id=None, account_name=None, success=True, error_msg=''):
    """记录操作日志（除查询外的所有操作）。该函数不抛出异常，避免影响主流程。"""
    try:
        execute_db('''
            INSERT INTO operation_logs (account_id, account_name, module, action, detail, success, error_msg)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (account_id, account_name, module, action, str(detail), 1 if success else 0, str(error_msg) if error_msg else ''))
    except Exception as e:
        print(f"[WARN] 写入操作日志失败: {e}")


def get_account_name(account_id):
    """根据账号ID获取账号名称"""
    try:
        row = query_db('SELECT name FROM accounts WHERE id = ?', (account_id,), one=True)
        return row['name'] if row else ''
    except Exception:
        return ''


def get_aliyun_account_info(access_key_id, access_key_secret):
    """获取阿里云账号ID和名称，优先STS，备选RAM，返回 (account_id, account_name, source, message)"""
    # 方法1：通过STS GetCallerIdentity
    try:
        from alibabacloud_sts20150401.client import Client as StsClient
        from alibabacloud_tea_openapi import models as open_api_models
        
        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'sts.aliyuncs.com'
        client = StsClient(config)
        
        # GetCallerIdentity 无参数，尝试无参调用
        try:
            resp = client.get_caller_identity()
        except TypeError:
            # 旧版本 SDK 需要 request 对象
            from alibabacloud_sts20150401 import models as sts_models
            req = sts_models.GetCallerIdentityRequest()
            resp = client.get_caller_identity(req)
        
        if resp.body and resp.body.account_id:
            account_id = str(resp.body.account_id)
            # 尝试获取账号名称（如果响应中有）
            account_name = getattr(resp.body, 'account_name', '') or ''
            return account_id, account_name, 'sts', 'success'
        return None, None, 'sts', 'response no account_id'
    except ImportError as e:
        app.logger.warning(f"STS SDK未安装: {str(e)}，尝试RAM方式")
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.warning(f"STS获取账号ID失败: {str(e)}，尝试RAM方式\n{tb}")

    # 方法2：通过RAM用户列表提取账号ID
    try:
        from alibabacloud_ram20150501.client import Client as RamClient
        from alibabacloud_ram20150501 import models as ram_models
        from alibabacloud_tea_openapi import models as open_api_models
        
        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'ram.aliyuncs.com'
        client = RamClient(config)
        
        req = ram_models.ListUsersRequest()
        resp = client.list_users(req)
        
        if resp.body and resp.body.users and resp.body.users.user:
            for u in resp.body.users.user:
                # 优先从 ARN 提取，格式：acs:ram::<account-id>:user/<username> 或 arn:acs:ram::<account-id>:user/<username>
                arn = getattr(u, 'arn', '') or ''
                if arn:
                    import re
                    m = re.search(r'(?:arn:)?acs:ram::(\d+):', arn)
                    if m:
                        return m.group(1), '', 'ram-arn', 'success'
                # 备选从 user_principal_name 提取
                upn = getattr(u, 'user_principal_name', '') or ''
                if '@' in upn:
                    account_part = upn.split('@')[1]
                    account_id = account_part.split('.')[0] if '.' in account_part else account_part
                    if account_id and account_id.isdigit():
                        return account_id, '', 'ram-upn', 'success'
            return None, None, 'ram', 'no valid arn or user_principal_name found'
        return None, None, 'ram', 'no ram users'
    except Exception as e:
        app.logger.error(f"RAM获取账号ID也失败: {str(e)}")
        return None, None, 'ram', str(e)
    return None, None, 'none', 'all methods failed'


# ==================== 阿里云API辅助函数 ====================

def create_aliyun_client(access_key_id, access_key_secret, endpoint):
    """创建阿里云SDK客户端"""
    try:
        from alibabacloud_tea_openapi import models as open_api_models
        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = endpoint
        return config
    except ImportError:
        print("[ERROR] 阿里云SDK未安装，请运行 pip install alibabacloud_tea_openapi")
        return None


def sync_ecs(account_id, access_key_id, access_key_secret):
    """同步ECS实例数据"""
    try:
        from alibabacloud_ecs20140526.client import Client as EcsClient
        from alibabacloud_ecs20140526 import models as ecs_models
        from alibabacloud_tea_openapi import models as open_api_models

        total_synced = 0
        for region_id in get_default_regions():
            try:
                config = open_api_models.Config(
                    access_key_id=access_key_id,
                    access_key_secret=access_key_secret
                )
                config.endpoint = 'ecs.aliyuncs.com'
                client = EcsClient(config)

                page_number = 1
                while True:
                    req = ecs_models.DescribeInstancesRequest(
                        region_id=region_id,
                        page_size=100,
                        page_number=page_number
                    )
                    resp = client.describe_instances(req)
                    if not resp.body or not resp.body.instances:
                        break
                    instances = resp.body.instances.instance or []

                    for inst in instances:
                        try:
                            # 提取内网IP
                            private_ip = ''
                            if hasattr(inst, 'vpc_attributes') and inst.vpc_attributes:
                                pip_obj = getattr(inst.vpc_attributes, 'private_ip_address', None)
                                if pip_obj and hasattr(pip_obj, 'ip_address') and pip_obj.ip_address:
                                    val = pip_obj.ip_address
                                    private_ip = ','.join(val) if isinstance(val, list) else str(val)
                            # 提取公网IP
                            public_ip = ''
                            if hasattr(inst, 'public_ip_address') and inst.public_ip_address:
                                pub_obj = inst.public_ip_address
                                if hasattr(pub_obj, 'ip_address') and pub_obj.ip_address:
                                    val = pub_obj.ip_address
                                    public_ip = ','.join(val) if isinstance(val, list) else str(val)
                            # EipAddress也可能有公网IP
                            if not public_ip and hasattr(inst, 'eip_address') and inst.eip_address:
                                eip_obj = inst.eip_address
                                if hasattr(eip_obj, 'ip_address') and eip_obj.ip_address:
                                    val = eip_obj.ip_address
                                    public_ip = ','.join(val) if isinstance(val, list) else str(val)

                            cpu = getattr(inst, 'cpu', 0) or 0
                            memory = getattr(inst, 'memory', 0) or 0

                            execute_db('''
                                INSERT OR REPLACE INTO ecs_instances
                                (account_id, instance_id, instance_name, status, instance_type,
                                 cpu, memory, os_type, private_ip, public_ip, region_id,
                                 created_time, expired_time, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                account_id, inst.instance_id, getattr(inst, 'instance_name', ''),
                                getattr(inst, 'status', ''), getattr(inst, 'instance_type', ''),
                                cpu, memory, getattr(inst, 'os_type', ''),
                                private_ip, public_ip, region_id,
                                getattr(inst, 'creation_time', ''), getattr(inst, 'expired_time', ''),
                                datetime.now()
                            ))
                            total_synced += 1
                        except Exception as e:
                            print(f"[WARN] 同步ECS实例 {getattr(inst, 'instance_id', 'unknown')} 失败: {str(e)}")
                            continue

                    total_count = resp.body.total_count or 0
                    if page_number * 100 >= total_count:
                        break
                    page_number += 1

            except Exception as e:
                print(f"[WARN] 同步ECS {region_id} 失败: {str(e)}")
                continue

        return total_synced
    except ImportError:
        print("[ERROR] ECS SDK未安装")
        return 0
    except Exception as e:
        print(f"[ERROR] 同步ECS失败: {str(e)}")
        return 0


def sync_rds(account_id, access_key_id, access_key_secret):
    """同步RDS实例数据"""
    try:
        from alibabacloud_rds20140815.client import Client as RdsClient
        from alibabacloud_rds20140815 import models as rds_models
        from alibabacloud_tea_openapi import models as open_api_models

        total_synced = 0
        for region_id in get_default_regions():
            try:
                config = open_api_models.Config(
                    access_key_id=access_key_id,
                    access_key_secret=access_key_secret
                )
                config.endpoint = 'rds.aliyuncs.com'
                client = RdsClient(config)
                # 兼容不同SDK版本的方法名
                describe_method = getattr(client, 'describe_db_instances', None) or getattr(client, 'describe_dbinstances', None)
                if not describe_method:
                    app.logger.error(f"RDS Client没有可用的DescribeDBInstances方法，可用方法: {all_methods}")
                    print(f"[ERROR] RDS Client没有可用的DescribeDBInstances方法，可用方法: {all_methods}", flush=True)
                    continue
                else:
                    app.logger.info(f"RDS使用方法: {describe_method.__name__}")

                page_number = 1
                while True:
                    req = rds_models.DescribeDBInstancesRequest(
                        region_id=region_id,
                        page_size=100,
                        page_number=page_number
                    )
                    resp = describe_method(req)
                    if not resp.body:
                        app.logger.info(f"RDS {region_id} page={page_number} resp.body为空")
                    # 调试：打印响应体属性
                    if page_number == 1:
                        body_attrs = [a for a in dir(resp.body) if not a.startswith('_')]
                        app.logger.info(f"RDS {region_id} resp.body属性: {body_attrs}")
                    items = getattr(resp.body, 'items', None)
                    if not items:
                        app.logger.info(f"RDS {region_id} items为空，body属性: {[a for a in dir(resp.body) if not a.startswith('_')]}")
                        break
                    items_attrs = [a for a in dir(items) if not a.startswith('_')]
                    app.logger.info(f"RDS {region_id} items属性: {items_attrs}")
                    instances = getattr(items, 'dbinstance', None) or getattr(items, 'db_instance', None) or getattr(items, 'dbinstances', None) or []

                    for inst in instances:
                        try:
                            execute_db('''
                                INSERT OR REPLACE INTO rds_instances
                                (account_id, instance_id, instance_name, engine, engine_version,
                                 instance_type, instance_cpu, instance_memory, status, region_id,
                                 connection_mode, created_time, expired_time, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                account_id, getattr(inst, 'dbinstance_id', getattr(inst, 'db_instance_id', getattr(inst, 'dbinstances_id', ''))),
                                getattr(inst, 'dbinstance_description', getattr(inst, 'db_instance_description', getattr(inst, 'dbinstances_description', ''))),
                                getattr(inst, 'engine', ''),
                                getattr(inst, 'engine_version', ''),
                                getattr(inst, 'dbinstance_type', getattr(inst, 'db_instance_type', getattr(inst, 'dbinstances_type', ''))),
                                getattr(inst, 'dbinstance_cpu', getattr(inst, 'db_instance_cpu', getattr(inst, 'dbinstances_cpu', ''))),
                                getattr(inst, 'dbinstance_memory', getattr(inst, 'db_instance_memory', getattr(inst, 'dbinstances_memory', ''))),
                                getattr(inst, 'dbinstance_status', getattr(inst, 'db_instance_status', getattr(inst, 'dbinstances_status', ''))),
                                region_id,
                                getattr(inst, 'connection_mode', ''),
                                getattr(inst, 'creation_time', ''),
                                getattr(inst, 'expire_time', ''),
                                datetime.now()
                            ))
                            total_synced += 1
                        except Exception as e:
                            print(f"[WARN] 同步RDS实例 {getattr(inst, 'db_instance_id', getattr(inst, 'dbinstances_id', 'unknown'))} 失败: {str(e)}")
                            continue

                    total_record = getattr(resp.body, 'total_record_count', None) or getattr(resp.body, 'totalrecordcount', None) or 0
                    if page_number * 100 >= total_record:
                        break
                    page_number += 1

            except Exception as e:
                print(f"[WARN] 同步RDS {region_id} 失败: {str(e)}")
                continue

        return total_synced
    except ImportError:
        print("[ERROR] RDS SDK未安装")
        return 0
    except Exception as e:
        print(f"[ERROR] 同步RDS失败: {str(e)}")
        return 0


def sync_slb(account_id, access_key_id, access_key_secret):
    """同步SLB实例数据"""
    try:
        from alibabacloud_slb20140515.client import Client as SlbClient
        from alibabacloud_slb20140515 import models as slb_models
        from alibabacloud_tea_openapi import models as open_api_models

        total_synced = 0
        for region_id in get_default_regions():
            try:
                config = open_api_models.Config(
                    access_key_id=access_key_id,
                    access_key_secret=access_key_secret
                )
                config.endpoint = 'slb.aliyuncs.com'
                client = SlbClient(config)

                page_number = 1
                while True:
                    req = slb_models.DescribeLoadBalancersRequest(
                        region_id=region_id,
                        page_size=100,
                        page_number=page_number
                    )
                    resp = client.describe_load_balancers(req)
                    items = resp.body.load_balancers if resp.body.load_balancers else None
                    instances = items.load_balancer if items else []

                    for inst in instances:
                        execute_db('''
                            INSERT OR REPLACE INTO slb_instances
                            (account_id, instance_id, instance_name, address, address_type,
                             status, network_type, region_id, created_time, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            account_id, inst.load_balancer_id,
                            getattr(inst, 'load_balancer_name', ''),
                            getattr(inst, 'address', ''),
                            getattr(inst, 'address_type', ''),
                            getattr(inst, 'load_balancer_status', ''),
                            getattr(inst, 'network_type', ''),
                            region_id,
                            getattr(inst, 'create_time', ''),
                            datetime.now()
                        ))
                        total_synced += 1

                    total_record = resp.body.total_count if resp.body.total_count else 0
                    if page_number * 100 >= total_record:
                        break
                    page_number += 1

            except Exception as e:
                print(f"[WARN] 同步SLB {region_id} 失败: {str(e)}")
                continue

        return total_synced
    except ImportError:
        print("[ERROR] SLB SDK未安装")
        return 0
    except Exception as e:
        print(f"[ERROR] 同步SLB失败: {str(e)}")
        return 0


def sync_oss(account_id, access_key_id, access_key_secret):
    """同步OSS Bucket数据"""
    try:
        import oss2

        total_synced = 0
        try:
            auth = oss2.Auth(access_key_id, access_key_secret)
            service = oss2.Service(auth, 'https://oss.aliyuncs.com')
            for bucket in oss2.BucketIterator(service):
                try:
                    bucket_info = bucket
                    # 格式化creation_date，可能是 datetime 对象或字符串
                    raw_date = getattr(bucket, 'creation_date', '')
                    if hasattr(raw_date, 'strftime'):
                        creation_date_str = raw_date.strftime('%Y-%m-%d %H:%M:%S')
                    else:
                        creation_date_str = str(raw_date)[:19].replace('T', ' ') if raw_date else ''
                    execute_db('''
                        INSERT OR REPLACE INTO oss_buckets
                        (account_id, bucket_name, location, storage_class, creation_date, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (
                        account_id,
                        bucket.name,
                        getattr(bucket, 'location', ''),
                        getattr(bucket, 'storage_class', ''),
                        creation_date_str,
                        datetime.now()
                    ))
                    total_synced += 1
                except Exception as e:
                    print(f"[WARN] 同步Bucket {bucket.name} 失败: {str(e)}")
                    continue
        except Exception as e:
            print(f"[WARN] 同步OSS失败: {str(e)}")

        return total_synced
    except ImportError:
        print("[ERROR] OSS SDK未安装")
        return 0
    except Exception as e:
        print(f"[ERROR] 同步OSS失败: {str(e)}")
        return 0


def sync_redis(account_id, access_key_id, access_key_secret):
    """同步Redis实例数据"""
    try:
        from alibabacloud_r_kvstore20150101.client import Client as KvstoreClient
        from alibabacloud_r_kvstore20150101 import models as kvstore_models
        from alibabacloud_tea_openapi import models as open_api_models

        total_synced = 0
        for region_id in get_default_regions():
            try:
                config = open_api_models.Config(
                    access_key_id=access_key_id,
                    access_key_secret=access_key_secret
                )
                config.endpoint = 'r-kvstore.aliyuncs.com'
                client = KvstoreClient(config)
                app.logger.info(f"Redis同步 {region_id} endpoint=r-kvstore.aliyuncs.com")

                page_number = 1
                while True:
                    req = kvstore_models.DescribeInstancesRequest(
                        region_id=region_id,
                        page_size=100,
                        page_number=page_number
                    )
                    resp = client.describe_instances(req)
                    if not resp.body or not resp.body.instances:
                        break
                    # 兼容不同SDK版本的字段名
                    instances = getattr(resp.body.instances, 'kvstore_instance', None) or getattr(resp.body.instances, 'kvstoreinstance', None) or []
                    if page_number == 1 and region_id == get_default_regions()[0]:
                        inst_attrs = [a for a in dir(resp.body.instances) if not a.startswith('_') and 'instance' in a.lower()]
                        app.logger.info(f"Redis instances属性: {inst_attrs}")

                    for inst in instances:
                        try:
                            execute_db('''
                                INSERT OR REPLACE INTO redis_instances
                                (account_id, instance_id, instance_name, instance_type, engine_version,
                                 architecture_type, capacity, status, region_id,
                                 connection_domain, port, created_time, expired_time, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                account_id, inst.instance_id,
                                getattr(inst, 'instance_name', ''),
                                getattr(inst, 'instance_type', ''),
                                getattr(inst, 'engine_version', ''),
                                getattr(inst, 'architecture_type', ''),
                                getattr(inst, 'capacity', ''),
                                getattr(inst, 'instance_status', '') or getattr(inst, 'status', ''),
                                region_id,
                                getattr(inst, 'connection_domain', ''),
                                getattr(inst, 'port', 0),
                                getattr(inst, 'creation_time', ''),
                                getattr(inst, 'end_time', ''),
                                datetime.now()
                            ))
                            total_synced += 1
                        except Exception as e:
                            print(f"[WARN] 同步Redis实例 {getattr(inst, 'instance_id', 'unknown')} 失败: {str(e)}")
                            continue

                    total_record = resp.body.total_count or 0
                    if page_number * 100 >= total_record:
                        break
                    page_number += 1

            except Exception as e:
                print(f"[WARN] 同步Redis {region_id} 失败: {str(e)}")
                continue

        return total_synced
    except ImportError:
        print("[ERROR] Redis SDK未安装")
        return 0
    except Exception as e:
        print(f"[ERROR] 同步Redis失败: {str(e)}")
        return 0


def sync_bill(account_id, access_key_id, access_key_secret):
    """同步账单数据（仅当月）"""
    try:
        from alibabacloud_bssopenapi20171214.client import Client as BssClient
        from alibabacloud_bssopenapi20171214 import models as bss_models
        from alibabacloud_tea_openapi import models as open_api_models

        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'business.aliyuncs.com'
        client = BssClient(config)

        # 同步当月账单
        synced_cycles = []
        now = datetime.now()
        billing_cycle = now.strftime('%Y-%m')

        try:
            # 兼容不同SDK版本的Request类名和方法名
            bill_req_class = getattr(bss_models, 'QueryBillRequest', None) or getattr(bss_models, 'QuerybillRequest', None)
            bill_method = getattr(client, 'query_bill', None) or getattr(client, 'querybill', None)

            if not bill_req_class or not bill_method:
                req_classes = [m for m in dir(bss_models) if 'querybill' in m.lower()]
                client_methods = [m for m in dir(client) if 'querybill' in m.lower()]
                app.logger.error(f"BSS账单Request类: {req_classes}, Client方法: {client_methods}")
                return synced_cycles

            total_amount = 0
            bill_items = []
            page_num = 1
            while True:
                req = bill_req_class(
                    billing_cycle=billing_cycle,
                    page_size=300,
                    page_num=page_num
                )
                resp = bill_method(req)
                data = resp.body.data if resp.body else None
                if not data or not hasattr(data, 'items') or not data.items:
                    break

                items_list = data.items.item if hasattr(data.items, 'item') else []
                if not items_list:
                    break

                for item in items_list:
                    item_dict = {
                        'billing_cycle': getattr(item, 'billing_cycle', ''),
                        'product_code': getattr(item, 'product_code', ''),
                        'product_type': getattr(item, 'product_type', ''),
                        'product_detail': getattr(item, 'product_detail', ''),
                        'deduct_amount': getattr(item, 'deduct_amount', 0),
                        'pretax_amount': getattr(item, 'pretax_amount', 0),
                        'cash_amount': getattr(item, 'cash_amount', 0),
                        'owner_id': getattr(item, 'owner_id', ''),
                    }
                    bill_items.append(item_dict)
                    try:
                        total_amount += float(str(getattr(item, 'pretax_amount', 0) or 0).replace(',', ''))
                    except (ValueError, TypeError):
                        pass

                # 检查是否还有下一页
                total_count = int(getattr(data, 'total_count', 0) or 0)
                if page_num * 300 >= total_count:
                    break
                page_num += 1

            execute_db('''
                INSERT OR REPLACE INTO monthly_bills
                (account_id, billing_cycle, total_amount, details, updated_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (account_id, billing_cycle, total_amount, json.dumps(bill_items, ensure_ascii=False), datetime.now()))
            synced_cycles.append(billing_cycle)
            app.logger.info(f"[账单] {billing_cycle} 同步成功，金额: {total_amount}")

        except Exception as e:
            print(f"[WARN] 同步账单 {billing_cycle} 失败: {str(e)}")

        return synced_cycles
    except ImportError:
        print("[ERROR] BSS SDK未安装")
        return []
    except Exception as e:
        print(f"[ERROR] 同步账单失败: {str(e)}")
        return []


def sync_balance(account_id, access_key_id, access_key_secret):
    """同步账号余额数据"""
    try:
        from alibabacloud_bssopenapi20171214.client import Client as BssClient
        from alibabacloud_bssopenapi20171214 import models as bss_models
        from alibabacloud_tea_openapi import models as open_api_models

        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'business.aliyuncs.com'
        client = BssClient(config)

                # 兼容不同SDK版本的方法名
        balance_method = getattr(client, 'query_account_balance', None) or getattr(client, 'queryaccountbalance', None)
        if not balance_method:
            all_methods = [m for m in dir(client) if 'query' in m.lower() and 'balance' in m.lower()]
            app.logger.error(f"BSS Client没有可用的QueryAccountBalance方法，可用方法: {all_methods}")
            return False

        try:
            # 兼容不同SDK版本的Request类名
            req_class = getattr(bss_models, 'QueryAccountBalanceRequest', None) or getattr(bss_models, 'QueryaccountbalanceRequest', None)
            if not req_class:
                req_classes = [m for m in dir(bss_models) if 'queryaccountbalance' in m.lower() or ('query' in m.lower() and 'balance' in m.lower())]
                app.logger.info(f"BSS SDK无QueryAccountBalanceRequest类，使用无参调用(正常)")
                # 尝试直接无参数调用
                resp = balance_method()
            else:
                req = req_class()
                resp = balance_method(req)

            if not resp or not resp.body:
                app.logger.warn("BSS余额响应body为空")
                return False

            # 调试：打印响应体属性
            body_attrs = [a for a in dir(resp.body) if not a.startswith('_')]
            app.logger.info(f"BSS resp.body属性: {body_attrs}")

            # 兼容不同SDK版本的data属性名
            data = getattr(resp.body, 'data', None)
            if not data:
                # 尝试直接从body取字段
                app.logger.info(f"BSS body.data为空，尝试直接从body取余额字段")
                available_amount = float(getattr(resp.body, 'available_amount', 0) or 0)
                available_cash = float(getattr(resp.body, 'available_cash', 0) or 0)
                credit_amount = float(getattr(resp.body, 'credit_amount', 0) or 0)
                currency = getattr(resp.body, 'currency', 'CNY') or 'CNY'
            else:
                data_attrs = [a for a in dir(data) if not a.startswith('_') and ('amount' in a.lower() or 'cash' in a.lower() or 'credit' in a.lower() or 'currency' in a.lower())]
                app.logger.info(f"BSS data属性（金额相关）: {data_attrs}")

                available_amount = 0
                available_cash = 0
                credit_amount = 0
                currency = 'CNY'

                # 打印原始值用于调试
                app.logger.info(f"BSS data原始值: available_amount={repr(getattr(data, 'available_amount', 'N/A'))}, available_cash_amount={repr(getattr(data, 'available_cash_amount', 'N/A'))}, credit_amount={repr(getattr(data, 'credit_amount', 'N/A'))}")

                # 阿里云返回的金额字符串可能含千位逗号(如 '15,556.49')，需先去除
                def parse_amount(val):
                    try:
                        s = str(val or 0)
                        s = s.replace(',', '')
                        return float(s)
                    except (ValueError, TypeError):
                        return 0.0

                available_amount = parse_amount(getattr(data, 'available_amount', 0))
                available_cash = parse_amount(getattr(data, 'available_cash_amount', getattr(data, 'available_cash', 0)))
                credit_amount = parse_amount(getattr(data, 'credit_amount', 0))
                currency = getattr(data, 'currency', 'CNY') or 'CNY'

            app.logger.info(f"BSS余额同步成功: available_amount={available_amount}, available_cash={available_cash}, credit_amount={credit_amount}")

            execute_db('''
                INSERT OR REPLACE INTO account_balance
                (account_id, available_amount, available_cash, credit_amount, currency, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (account_id, available_amount, available_cash, credit_amount, currency, datetime.now()))

            return True
        except Exception as e:
            app.logger.error(f"同步余额失败: {str(e)}")
            return False

    except ImportError:
        app.logger.error("BSS SDK未安装")
        return False
    except Exception as e:
        app.logger.error(f"同步余额失败: {str(e)}")
        return False


def sync_renewal_prices(account_id, access_key_id, access_key_secret):
    """同步续费价格（ECS、RDS、Redis）"""
    from concurrent.futures import ThreadPoolExecutor
    
    # ECS续费价格
    ecs_instances = query_db('SELECT instance_id, region_id FROM ecs_instances WHERE account_id = ?', (account_id,))
    if ecs_instances:
        def query_ecs_price(inst):
            try:
                price = _query_ecs_renewal_price(access_key_id, access_key_secret, inst['instance_id'], inst['region_id'])
                if price is not None:
                    execute_db('UPDATE ecs_instances SET renewal_price = ? WHERE instance_id = ? AND account_id = ?',
                              (price, inst['instance_id'], account_id))
            except Exception as e:
                app.logger.warning(f"ECS续费价格查询失败 {inst['instance_id']}: {str(e)}")
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            executor.map(query_ecs_price, ecs_instances)
        app.logger.info(f"ECS续费价格同步完成: {len(ecs_instances)}个实例")
    
    # RDS续费价格
    rds_instances = query_db('SELECT instance_id, region_id FROM rds_instances WHERE account_id = ?', (account_id,))
    if rds_instances:
        def query_rds_price(inst):
            try:
                price = _query_rds_renewal_price(access_key_id, access_key_secret, inst['instance_id'], inst['region_id'])
                if price is not None:
                    execute_db('UPDATE rds_instances SET renewal_price = ? WHERE instance_id = ? AND account_id = ?',
                              (price, inst['instance_id'], account_id))
            except Exception as e:
                app.logger.warning(f"RDS续费价格查询失败 {inst['instance_id']}: {str(e)}")
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            executor.map(query_rds_price, rds_instances)
        app.logger.info(f"RDS续费价格同步完成: {len(rds_instances)}个实例")
    
    # Redis续费价格
    redis_instances = query_db('SELECT instance_id, region_id FROM redis_instances WHERE account_id = ?', (account_id,))
    if redis_instances:
        def query_redis_price(inst):
            try:
                price = _query_redis_renewal_price(access_key_id, access_key_secret, inst['instance_id'], inst['region_id'])
                if price is not None:
                    execute_db('UPDATE redis_instances SET renewal_price = ? WHERE instance_id = ? AND account_id = ?',
                              (price, inst['instance_id'], account_id))
            except Exception as e:
                app.logger.warning(f"Redis续费价格查询失败 {inst['instance_id']}: {str(e)}")
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            executor.map(query_redis_price, redis_instances)
        app.logger.info(f"Redis续费价格同步完成: {len(redis_instances)}个实例")


def do_sync_account(account_id, sync_type='all'):
    """同步单个账号数据
    sync_type: 'all' = 全部, 'resources' = 仅资源, 'bills' = 仅账单
    """
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM accounts WHERE id = ?', (account_id,))
        row = cursor.fetchone()
        account = dict(row) if row else None
        conn.close()

        if not account:
            return {'success': False, 'message': '账号不存在'}

        ak = account['access_key_id']
        sk = account['access_key_secret']

        # 获取并存储阿里云账号ID和名称
        try:
            aliyun_account_id, aliyun_account_name, source, msg = get_aliyun_account_info(ak, sk)
            if aliyun_account_id:
                execute_db('UPDATE accounts SET aliyun_account_id = ?, aliyun_account_name = ? WHERE id = ?', 
                          (aliyun_account_id, aliyun_account_name or '', account_id))
                app.logger.info(f"账号 {account_id} 阿里云账号ID获取成功: {aliyun_account_id} (来源: {source})")
            else:
                app.logger.warning(f"账号 {account_id} 阿里云账号ID获取失败: source={source}, msg={msg}")
        except Exception as e:
            app.logger.error(f"同步阿里云账号ID失败: {str(e)}")

        # 同步各资源（每个都try，不互相影响）
        results = {}
        errors = []
        sync_resources = sync_type in ('all', 'resources')
        sync_bills = sync_type in ('all', 'bills')

        # ===== 资源同步 =====
        if sync_resources:
            # 删除旧资源数据
            for table in ['ecs_instances', 'rds_instances', 'slb_instances', 'oss_buckets', 'redis_instances']:
                execute_db(f'DELETE FROM {table} WHERE account_id = ?', (account_id,))

            try:
                results['ecs'] = sync_ecs(account_id, ak, sk)
            except Exception as e:
                results['ecs'] = 0
                errors.append(f'ECS: {str(e)}')
                print(f"[ERROR] 同步ECS异常: {str(e)}")

            try:
                results['rds'] = sync_rds(account_id, ak, sk)
            except Exception as e:
                results['rds'] = 0
                errors.append(f'RDS: {str(e)}')
                print(f"[ERROR] 同步RDS异常: {str(e)}")

            try:
                results['slb'] = sync_slb(account_id, ak, sk)
            except Exception as e:
                results['slb'] = 0
                errors.append(f'SLB: {str(e)}')
                print(f"[ERROR] 同步SLB异常: {str(e)}")

            try:
                results['oss'] = sync_oss(account_id, ak, sk)
            except Exception as e:
                results['oss'] = 0
                errors.append(f'OSS: {str(e)}')
                print(f"[ERROR] 同步OSS异常: {str(e)}")

            try:
                results['redis'] = sync_redis(account_id, ak, sk)
            except Exception as e:
                results['redis'] = 0
                errors.append(f'Redis: {str(e)}')
                print(f"[ERROR] 同步Redis异常: {str(e)}")

            # 同步续费价格
            try:
                sync_renewal_prices(account_id, ak, sk)
            except Exception as e:
                print(f"[WARN] 同步续费价格失败: {str(e)}")

        # ===== 账单同步（仅当月）=====
        if sync_bills:
            try:
                results['bills'] = sync_bill(account_id, ak, sk)
            except Exception as e:
                results['bills'] = []
                errors.append(f'账单: {str(e)}')
                print(f"[ERROR] 同步账单异常: {str(e)}")

            try:
                results['balance'] = sync_balance(account_id, ak, sk)
            except Exception as e:
                results['balance'] = False
                errors.append(f'余额: {str(e)}')
                print(f"[ERROR] 同步余额异常: {str(e)}")

        # 构建结果消息
        type_label = {'all': '全部', 'resources': '资源', 'bills': '账单'}.get(sync_type, sync_type)
        msg_parts = [f"[{type_label}]"]
        if sync_resources:
            msg_parts.append(f"ECS={results.get('ecs', '-')}, RDS={results.get('rds', '-')}, SLB={results.get('slb', '-')}, OSS={results.get('oss', '-')}, Redis={results.get('redis', '-')}")
        if sync_bills:
            cycles = results.get('bills', [])
            msg_parts.append(f"账单={','.join(cycles) if cycles else '无'}")
        msg = ' | '.join(msg_parts)
        if errors:
            msg += f" | 错误: {'; '.join(errors)}"

        # 更新账号的last_sync_at
        execute_db('UPDATE accounts SET last_sync_at = ? WHERE id = ?',
                   (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), account_id))

        return {
            'success': True,
            'message': msg,
            'data': results
        }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] do_sync_account整体异常: {str(e)}\n{tb}", flush=True)
        app.logger.error(f"do_sync_account整体异常: {str(e)}\n{tb}")
        return {'success': False, 'message': f'同步失败: {str(e)}'}


# ==================== 异步同步任务管理 ====================

def _run_sync_task(task_id, account_id, sync_type):
    """在后台线程中执行同步任务"""
    acct_name = get_account_name(account_id)
    try:
        with sync_tasks_lock:
            sync_tasks[task_id]['status'] = 'running'
            sync_tasks[task_id]['started_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        result = do_sync_account(account_id, sync_type=sync_type)

        with sync_tasks_lock:
            sync_tasks[task_id]['status'] = 'completed'
            sync_tasks[task_id]['result'] = result
            sync_tasks[task_id]['completed_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        type_label = {'all': '全部', 'resources': '资源', 'bills': '账单'}.get(sync_type, '全部')
        ok = result.get('success', False) if isinstance(result, dict) else False
        log_operation('数据同步', f'同步{type_label}', result.get('message', '') if isinstance(result, dict) else '',
                      account_id=account_id, account_name=acct_name, success=ok,
                      error_msg='' if ok else (result.get('message', '') if isinstance(result, dict) else ''))
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f"[同步任务 {task_id}] 异常: {str(e)}\n{tb}")
        with sync_tasks_lock:
            sync_tasks[task_id]['status'] = 'failed'
            sync_tasks[task_id]['error'] = str(e)
            sync_tasks[task_id]['completed_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_operation('数据同步', '同步任务', f'同步任务异常', account_id=account_id, account_name=acct_name, success=False, error_msg=str(e))


def _run_sync_all_task(task_id, accounts, sync_type):
    """在后台线程中执行全量同步任务"""
    try:
        with sync_tasks_lock:
            sync_tasks[task_id]['status'] = 'running'
            sync_tasks[task_id]['started_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            sync_tasks[task_id]['total'] = len(accounts)
            sync_tasks[task_id]['current'] = 0

        results = []
        for i, acct in enumerate(accounts):
            try:
                app.logger.info(f"[同步全部] 开始同步账号 {acct['name']} (ID={acct['id']})")
                result = do_sync_account(acct['id'], sync_type=sync_type)
                results.append({
                    'account_id': acct['id'],
                    'account_name': acct['name'],
                    **result
                })
            except Exception as e:
                results.append({
                    'account_id': acct['id'],
                    'account_name': acct['name'],
                    'success': False,
                    'message': f'同步异常: {str(e)}'
                })

            with sync_tasks_lock:
                sync_tasks[task_id]['current'] = i + 1

        with sync_tasks_lock:
            sync_tasks[task_id]['status'] = 'completed'
            sync_tasks[task_id]['result'] = {'success': True, 'results': results}
            sync_tasks[task_id]['completed_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f"[同步任务 {task_id}] 异常: {str(e)}\n{tb}")
        with sync_tasks_lock:
            sync_tasks[task_id]['status'] = 'failed'
            sync_tasks[task_id]['error'] = str(e)
            sync_tasks[task_id]['completed_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')


# ==================== 数据库备份 ====================

import shutil

def backup_database():
    """备份 SQLite 数据库文件，保留最近 7 天的备份"""
    try:
        if not os.path.exists(DB_PATH):
            return
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = os.path.join(BACKUP_DIR, f'aliyun_platform_{timestamp}.db')
        shutil.copy2(DB_PATH, backup_path)
        app.logger.info(f"[备份] 数据库已备份: {backup_path}")

        # 清理旧备份（保留7天）
        cutoff = datetime.now().timestamp() - 7 * 86400
        for f in os.listdir(BACKUP_DIR):
            fp = os.path.join(BACKUP_DIR, f)
            if os.path.isfile(fp) and os.path.getmtime(fp) < cutoff:
                os.remove(fp)
                app.logger.info(f"[备份] 已清理旧备份: {f}")
    except Exception as e:
        app.logger.error(f"[备份] 备份失败: {str(e)}")


# ==================== API路由 ====================

# ---------- 账号管理 ----------

@app.route('/api/accounts', methods=['GET'])
def api_get_accounts():
    """获取所有账号列表"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, access_key_id, remark, created_at, updated_at, last_sync_at, aliyun_account_id, aliyun_account_name FROM accounts ORDER BY id')
    accounts = []
    for row in cursor.fetchall():
        acct = dict(row)
        # 隐藏AccessKey Secret
        acct['access_key_id'] = acct['access_key_id'][:4] + '****' + acct['access_key_id'][-4:] if len(acct['access_key_id']) > 8 else '****'
        accounts.append(acct)
    conn.close()
    return jsonify(accounts)


@app.route('/api/accounts', methods=['POST'])
def api_add_account():
    """添加新账号"""
    data = request.json
    name = data.get('name', '').strip()
    access_key_id = data.get('access_key_id', '').strip()
    access_key_secret = data.get('access_key_secret', '').strip()
    remark = data.get('remark', '').strip()

    if not name or not access_key_id or not access_key_secret:
        return jsonify({'error': '请填写账号名称、AccessKey ID和AccessKey Secret'}), 400

    try:
        last_id = execute_db(
            'INSERT INTO accounts (name, access_key_id, access_key_secret, remark) VALUES (?, ?, ?, ?)',
            (name, access_key_id, access_key_secret, remark)
        )
        log_operation('账号管理', '添加账号', f'新增账号：{name}', account_id=last_id, account_name=name)
        return jsonify({'success': True, 'id': last_id, 'message': '账号添加成功'})
    except Exception as e:
        log_operation('账号管理', '添加账号', f'新增账号：{name}', account_name=name, success=False, error_msg=str(e))
        return jsonify({'error': f'添加账号失败: {str(e)}'}), 500


@app.route('/api/accounts/<int:account_id>', methods=['DELETE'])
def api_delete_account(account_id):
    """删除账号及其所有数据"""
    acct_name = get_account_name(account_id)
    try:
        execute_db('DELETE FROM ecs_instances WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM rds_instances WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM slb_instances WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM oss_buckets WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM redis_instances WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM monthly_bills WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM account_balance WHERE account_id = ?', (account_id,))
        execute_db('DELETE FROM accounts WHERE id = ?', (account_id,))
        log_operation('账号管理', '删除账号', f'删除账号：{acct_name}', account_id=account_id, account_name=acct_name)
        return jsonify({'success': True, 'message': '账号已删除'})
    except Exception as e:
        log_operation('账号管理', '删除账号', f'删除账号：{acct_name}', account_id=account_id, account_name=acct_name, success=False, error_msg=str(e))
        return jsonify({'error': f'删除账号失败: {str(e)}'}), 500


@app.route('/api/accounts/<int:account_id>', methods=['PUT'])
def api_update_account(account_id):
    """更新账号信息"""
    data = request.json
    name = data.get('name', '').strip()
    access_key_id = data.get('access_key_id', '').strip()
    access_key_secret = data.get('access_key_secret', '').strip()
    remark = data.get('remark', '').strip()

    try:
        if access_key_secret:
            execute_db('''
                UPDATE accounts SET name=?, access_key_id=?, access_key_secret=?, remark=?, updated_at=?
                WHERE id=?
            ''', (name, access_key_id, access_key_secret, remark, datetime.now(), account_id))
        else:
            execute_db('''
                UPDATE accounts SET name=?, access_key_id=?, remark=?, updated_at=?
                WHERE id=?
            ''', (name, access_key_id, remark, datetime.now(), account_id))
        log_operation('账号管理', '更新账号', f'更新账号：{name}', account_id=account_id, account_name=name)
        return jsonify({'success': True, 'message': '账号更新成功'})
    except Exception as e:
        log_operation('账号管理', '更新账号', f'更新账号：{name}', account_id=account_id, account_name=name, success=False, error_msg=str(e))
        return jsonify({'error': f'更新账号失败: {str(e)}'}), 500


@app.route('/api/accounts/<int:account_id>/refresh-aliyun-id', methods=['POST'])
def api_refresh_aliyun_id(account_id):
    """手动刷新单个账号的阿里云账号ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT name, access_key_id, access_key_secret FROM accounts WHERE id = ?', (account_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return jsonify({'success': False, 'error': '账号不存在'}), 404
        
        account = dict(row)
        aliyun_account_id, aliyun_account_name, source, msg = get_aliyun_account_info(
            account['access_key_id'],
            account['access_key_secret']
        )
        if aliyun_account_id:
            execute_db('UPDATE accounts SET aliyun_account_id = ?, aliyun_account_name = ? WHERE id = ?', 
                      (aliyun_account_id, aliyun_account_name or '', account_id))
            return jsonify({
                'success': True,
                'account_id': account_id,
                'aliyun_account_id': aliyun_account_id,
                'aliyun_account_name': aliyun_account_name or '',
                'source': source,
                'message': '获取成功'
            })
        return jsonify({
            'success': False,
            'account_id': account_id,
            'source': source,
            'message': msg
        }), 400
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'刷新阿里云账号ID失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/refresh-aliyun-ids', methods=['POST'])
def api_refresh_all_aliyun_ids():
    """批量刷新所有账号的阿里云账号ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, access_key_id, access_key_secret FROM accounts ORDER BY id')
        accounts = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        results = []
        for acct in accounts:
            try:
                aliyun_account_id, aliyun_account_name, source, msg = get_aliyun_account_info(
                    acct['access_key_id'],
                    acct['access_key_secret']
                )
                if aliyun_account_id:
                    execute_db('UPDATE accounts SET aliyun_account_id = ?, aliyun_account_name = ? WHERE id = ?', 
                              (aliyun_account_id, aliyun_account_name or '', acct['id']))
                    results.append({
                        'id': acct['id'],
                        'name': acct['name'],
                        'aliyun_account_id': aliyun_account_id,
                        'aliyun_account_name': aliyun_account_name or '',
                        'source': source,
                        'success': True
                    })
                else:
                    results.append({
                        'id': acct['id'],
                        'name': acct['name'],
                        'source': source,
                        'message': msg,
                        'success': False
                    })
            except Exception as e:
                results.append({
                    'id': acct['id'],
                    'name': acct['name'],
                    'success': False,
                    'message': str(e)
                })
        return jsonify({'success': True, 'results': results})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'批量刷新阿里云账号ID失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------- 数据同步 ----------

@app.route('/api/accounts/<int:account_id>/sync', methods=['POST'])
def api_sync_account(account_id):
    """同步单个账号数据"""
    try:
        data = request.get_json(silent=True) or {}
        sync_type = data.get('sync_type', 'all')
        if sync_type not in ('all', 'resources', 'bills'):
            sync_type = 'all'

        task_id = f"sync_{account_id}_{int(datetime.now().timestamp())}"
        with sync_tasks_lock:
            sync_tasks[task_id] = {
                'status': 'pending',
                'type': 'single',
                'account_id': account_id,
                'sync_type': sync_type,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

        t = threading.Thread(target=_run_sync_task, args=(task_id, account_id, sync_type), daemon=True)
        t.start()
        app.logger.info(f"[同步] 已创建异步任务 {task_id}")
        return jsonify({'success': True, 'task_id': task_id, 'message': '同步任务已启动'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'启动同步失败: {str(e)}'}), 500


@app.route('/api/accounts/sync-all', methods=['POST'])
def api_sync_all_accounts():
    """异步同步所有账号数据并返回 task_id"""
    try:
        data = request.get_json(silent=True) or {}
        sync_type = data.get('sync_type', 'all')
        if sync_type not in ('all', 'resources', 'bills'):
            sync_type = 'all'

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, name FROM accounts')
        accounts = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not accounts:
            return jsonify({'success': True, 'results': [], 'message': '没有需要同步的账号'})

        task_id = f"sync_all_{int(datetime.now().timestamp())}"
        with sync_tasks_lock:
            sync_tasks[task_id] = {
                'status': 'pending',
                'type': 'all',
                'sync_type': sync_type,
                'total': len(accounts),
                'current': 0,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

        t = threading.Thread(target=_run_sync_all_task, args=(task_id, accounts, sync_type), daemon=True)
        t.start()
        app.logger.info(f"[同步全部] 已创建异步任务 {task_id}，账号数={len(accounts)}")
        return jsonify({'success': True, 'task_id': task_id, 'message': f'同步任务已启动，共{len(accounts)} 个账号'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'启动同步失败: {str(e)}'}), 500


@app.route('/api/sync-status/<task_id>', methods=['GET'])
def api_get_sync_status(task_id):
    """查询同步任务状态"""
    with sync_tasks_lock:
        task = sync_tasks.get(task_id)
    if not task:
        return jsonify({'status': 'not_found', 'message': '任务不存在'})
    return jsonify(task)


@app.route('/api/health', methods=['GET'])
def api_health():
    """健康检查接口"""
    status = {'status': 'ok', 'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    # 检查数据库
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM accounts')
        status['accounts'] = cursor.fetchone()[0]
        conn.close()
        status['database'] = 'ok'
    except Exception as e:
        status['database'] = f'error: {str(e)}'
        status['status'] = 'degraded'
    # 检查调度器
    status['scheduler'] = 'running' if scheduler.running else 'stopped'
    # 活跃同步任务
    with sync_tasks_lock:
        active = [t for t in sync_tasks.values() if t.get('status') in ('pending', 'running')]
        status['active_sync_tasks'] = len(active)
    return jsonify(status)


# ---------- 资源概览 ----------

@app.route('/api/overview', methods=['GET'])
def api_get_overview():
    """获取资源概览数据"""
    conn = get_db()
    cursor = conn.cursor()

    # 获取所有账号
    cursor.execute('SELECT id, name, remark, aliyun_account_id FROM accounts ORDER BY id')
    accounts = [dict(row) for row in cursor.fetchall()]

    current_month = datetime.now().strftime('%Y-%m')

    overview = []
    for acct in accounts:
        aid = acct['id']

        # 各资源数量
        cursor.execute('SELECT COUNT(*) as cnt FROM ecs_instances WHERE account_id = ?', (aid,))
        ecs_count = cursor.fetchone()['cnt']

        cursor.execute('SELECT COUNT(*) as cnt FROM rds_instances WHERE account_id = ?', (aid,))
        rds_count = cursor.fetchone()['cnt']

        cursor.execute('SELECT COUNT(*) as cnt FROM slb_instances WHERE account_id = ?', (aid,))
        slb_count = cursor.fetchone()['cnt']

        cursor.execute('SELECT COUNT(*) as cnt FROM oss_buckets WHERE account_id = ?', (aid,))
        oss_count = cursor.fetchone()['cnt']

        cursor.execute('SELECT COUNT(*) as cnt FROM redis_instances WHERE account_id = ?', (aid,))
        redis_count = cursor.fetchone()['cnt']

        # 当月消费
        cursor.execute('SELECT total_amount FROM monthly_bills WHERE account_id = ? AND billing_cycle = ?', (aid, current_month))
        bill_row = cursor.fetchone()
        month_amount = bill_row['total_amount'] if bill_row else 0

        # 账号余额
        cursor.execute('SELECT available_amount, available_cash, credit_amount FROM account_balance WHERE account_id = ?', (aid,))
        balance_row = cursor.fetchone()

        overview.append({
            'account_id': aid,
            'aliyun_account_id': acct['aliyun_account_id'] or '',
            'account_name': acct['name'],
            'remark': acct['remark'] or '',
            'ecs_count': ecs_count,
            'rds_count': rds_count,
            'slb_count': slb_count,
            'oss_count': oss_count,
            'redis_count': redis_count,
            'month_amount': round(month_amount, 2),
            'available_amount': round(balance_row['available_amount'], 2) if balance_row else 0,
            'available_cash': round(balance_row['available_cash'], 2) if balance_row else 0,
            'credit_amount': round(balance_row['credit_amount'], 2) if balance_row else 0,
        })

    conn.close()
    return jsonify(overview)


# ---------- 资源管理 ----------

@app.route('/api/ecs', methods=['GET'])
def api_get_ecs():
    """获取ECS实例列表，支持 status/region 筛选"""
    account_id = request.args.get('account_id')
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    region = request.args.get('region', '').strip()

    conn = get_db()
    cursor = conn.cursor()

    sql = '''
        SELECT e.*, a.name as account_name
        FROM ecs_instances e
        LEFT JOIN accounts a ON e.account_id = a.id
        WHERE 1=1
    '''
    params = []

    if account_id:
        sql += ' AND e.account_id = ?'
        params.append(account_id)

    if status:
        sql += ' AND e.status = ?'
        params.append(status)

    if region:
        sql += ' AND e.region_id = ?'
        params.append(region)

    if keyword:
        sql += ''' AND (e.instance_id LIKE ? OR e.instance_name LIKE ? OR e.private_ip LIKE ? OR e.public_ip LIKE ?)'''
        kw = f'%{keyword}%'
        params.extend([kw, kw, kw, kw])

    sql += ' ORDER BY e.created_time DESC, e.account_id, e.region_id'

    cursor.execute(sql, params)
    instances = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(instances)


@app.route('/api/rds', methods=['GET'])
def api_get_rds():
    """获取RDS实例列表，支持 status/region 筛选"""
    account_id = request.args.get('account_id')
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    region = request.args.get('region', '').strip()

    conn = get_db()
    cursor = conn.cursor()

    sql = '''
        SELECT r.*, a.name as account_name
        FROM rds_instances r
        LEFT JOIN accounts a ON r.account_id = a.id
        WHERE 1=1
    '''
    params = []

    if account_id:
        sql += ' AND r.account_id = ?'
        params.append(account_id)

    if status:
        sql += ' AND r.status = ?'
        params.append(status)

    if region:
        sql += ' AND r.region_id = ?'
        params.append(region)

    if keyword:
        sql += ''' AND (r.instance_id LIKE ? OR r.instance_name LIKE ?)'''
        kw = f'%{keyword}%'
        params.extend([kw, kw])

    sql += ' ORDER BY r.created_time DESC, r.account_id, r.region_id'

    cursor.execute(sql, params)
    instances = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(instances)


@app.route('/api/slb', methods=['GET'])
def api_get_slb():
    """获取SLB实例列表，支持 status/region 筛选"""
    account_id = request.args.get('account_id')
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    region = request.args.get('region', '').strip()

    conn = get_db()
    cursor = conn.cursor()

    sql = '''
        SELECT s.*, a.name as account_name
        FROM slb_instances s
        LEFT JOIN accounts a ON s.account_id = a.id
        WHERE 1=1
    '''
    params = []

    if account_id:
        sql += ' AND s.account_id = ?'
        params.append(account_id)

    if status:
        sql += ' AND s.status = ?'
        params.append(status)

    if region:
        sql += ' AND s.region_id = ?'
        params.append(region)

    if keyword:
        sql += ''' AND (s.instance_id LIKE ? OR s.instance_name LIKE ? OR s.address LIKE ?)'''
        kw = f'%{keyword}%'
        params.extend([kw, kw, kw])

    sql += ' ORDER BY s.created_time DESC, s.account_id, s.region_id'

    cursor.execute(sql, params)
    instances = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(instances)


@app.route('/api/oss', methods=['GET'])
def api_get_oss():
    """获取OSS Bucket列表"""
    account_id = request.args.get('account_id')
    keyword = request.args.get('keyword', '').strip()

    conn = get_db()
    cursor = conn.cursor()

    sql = '''
        SELECT o.*, a.name as account_name
        FROM oss_buckets o
        LEFT JOIN accounts a ON o.account_id = a.id
        WHERE 1=1
    '''
    params = []

    if account_id:
        sql += ' AND o.account_id = ?'
        params.append(account_id)

    if keyword:
        sql += ''' AND (o.bucket_name LIKE ? OR o.location LIKE ?)'''
        kw = f'%{keyword}%'
        params.extend([kw, kw])

    sql += ' ORDER BY o.creation_date DESC, o.bucket_name'

    cursor.execute(sql, params)
    buckets = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(buckets)


@app.route('/api/redis', methods=['GET'])
def api_get_redis():
    """获取Redis实例列表，支持 status/region 筛选"""
    account_id = request.args.get('account_id')
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    region = request.args.get('region', '').strip()

    conn = get_db()
    cursor = conn.cursor()

    sql = '''
        SELECT r.*, a.name as account_name
        FROM redis_instances r
        LEFT JOIN accounts a ON r.account_id = a.id
        WHERE 1=1
    '''
    params = []

    if account_id:
        sql += ' AND r.account_id = ?'
        params.append(account_id)

    if status:
        sql += ' AND r.status = ?'
        params.append(status)

    if region:
        sql += ' AND r.region_id = ?'
        params.append(region)

    if keyword:
        sql += ''' AND (r.instance_id LIKE ? OR r.instance_name LIKE ? OR r.connection_domain LIKE ?)'''
        kw = f'%{keyword}%'
        params.extend([kw, kw, kw])

    sql += ' ORDER BY r.created_time DESC, r.account_id, r.region_id'

    cursor.execute(sql, params)
    instances = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(instances)


# ---------- 续费价格查询 ----------

def _query_ecs_renewal_price(access_key_id, access_key_secret, instance_id, region_id):
    """查询单个ECS实例续费价格（1个月）"""
    try:
        from alibabacloud_ecs20140526.client import Client as EcsClient
        from alibabacloud_ecs20140526 import models as ecs_models
        from alibabacloud_tea_openapi import models as open_api_models

        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'ecs.aliyuncs.com'
        client = EcsClient(config)

        req = ecs_models.DescribeRenewalPriceRequest(
            region_id=region_id,
            resource_id=instance_id,
            period=1,
            price_unit='Month'
        )
        resp = client.describe_renewal_price(req)
        if resp.body and resp.body.price_info and resp.body.price_info.price:
            return resp.body.price_info.price.trade_price
        return None
    except Exception as e:
        app.logger.warning(f"查询ECS {instance_id} 续费价格失败: {str(e)}")
        return None


def _query_rds_renewal_price(access_key_id, access_key_secret, instance_id, region_id):
    """查询单个RDS实例续费价格（1个月）"""
    try:
        from alibabacloud_rds20140815.client import Client as RdsClient
        from alibabacloud_rds20140815 import models as rds_models
        from alibabacloud_tea_openapi import models as open_api_models

        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'rds.aliyuncs.com'
        client = RdsClient(config)

        # RDS使用DescribePrice API，order_type='RENEW'
        req = rds_models.DescribePriceRequest(
            region_id=region_id,
            dbinstance_id=instance_id,
            order_type='RENEW',
            time_type='Month',
            used_time=1,
            quantity=1
        )
        resp = client.describe_price(req)
        if resp.body and resp.body.price_info:
            return resp.body.price_info.trade_price
        return None
    except Exception as e:
        app.logger.warning(f"查询RDS {instance_id} 续费价格失败: {str(e)}")
        return None


def _query_redis_renewal_price(access_key_id, access_key_secret, instance_id, region_id):
    """查询单个Redis实例续费价格（1个月）"""
    try:
        from alibabacloud_r_kvstore20150101.client import Client as KvstoreClient
        from alibabacloud_r_kvstore20150101 import models as kvstore_models
        from alibabacloud_tea_openapi import models as open_api_models

        config = open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret
        )
        config.endpoint = 'r-kvstore.aliyuncs.com'
        client = KvstoreClient(config)

        req = kvstore_models.DescribePriceRequest(
            region_id=region_id,
            instance_type='Redis',
            order_type='RENEW',
            instance_id=instance_id,
            period=1,
            price_unit='Month'
        )
        resp = client.describe_price(req)
        if resp.body and resp.body.price_info and resp.body.price_info.price:
            return resp.body.price_info.price.trade_price
        return None
    except Exception as e:
        app.logger.warning(f"查询Redis {instance_id} 续费价格失败: {str(e)}")
        return None


# ---------- 区域列表 ----------

@app.route('/api/regions', methods=['GET'])
def api_get_regions():
    """获取所有资源中实际使用的区域列表"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT DISTINCT region_id FROM (
            SELECT region_id FROM ecs_instances WHERE region_id IS NOT NULL AND region_id != ''
            UNION
            SELECT region_id FROM rds_instances WHERE region_id IS NOT NULL AND region_id != ''
            UNION
            SELECT region_id FROM slb_instances WHERE region_id IS NOT NULL AND region_id != ''
            UNION
            SELECT region_id FROM redis_instances WHERE region_id IS NOT NULL AND region_id != ''
        ) ORDER BY region_id
    ''')
    regions = [row['region_id'] for row in cursor.fetchall()]
    conn.close()
    return jsonify(regions)


# ---------- 账单管理 ----------

@app.route('/api/bills', methods=['GET'])
def api_get_bills():
    """获取账单数据"""
    billing_cycle = request.args.get('billing_cycle', datetime.now().strftime('%Y-%m'))
    account_id = request.args.get('account_id')

    conn = get_db()
    cursor = conn.cursor()

    sql = '''
        SELECT mb.*, a.name as account_name
        FROM monthly_bills mb
        LEFT JOIN accounts a ON mb.account_id = a.id
        WHERE mb.billing_cycle = ?
    '''
    params = [billing_cycle]

    if account_id:
        sql += ' AND mb.account_id = ?'
        params.append(account_id)

    sql += ' ORDER BY mb.account_id'

    cursor.execute(sql, params)
    bills = [dict(row) for row in cursor.fetchall()]

    # 解析账单明细
    for bill in bills:
        try:
            bill['details'] = json.loads(bill['details']) if bill['details'] else []
        except (json.JSONDecodeError, TypeError):
            bill['details'] = []

    # 计算总额
    total_amount = sum(b['total_amount'] for b in bills)

    # 获取所有可用的账单月份
    cursor.execute('SELECT DISTINCT billing_cycle FROM monthly_bills ORDER BY billing_cycle DESC')
    available_cycles = [row['billing_cycle'] for row in cursor.fetchall()]

    conn.close()

    return jsonify({
        'billing_cycle': billing_cycle,
        'bills': bills,
        'total_amount': round(total_amount, 2),
        'available_cycles': available_cycles
    })


@app.route('/api/bills/summary', methods=['GET'])
def api_get_bill_summary():
    """获取所有账号的账单汇总"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT mb.billing_cycle, SUM(mb.total_amount) as total_amount
        FROM monthly_bills mb
        GROUP BY mb.billing_cycle
        ORDER BY mb.billing_cycle DESC
    ''')

    summary = [dict(row) for row in cursor.fetchall()]
    for item in summary:
        item['total_amount'] = round(item['total_amount'], 2)

    conn.close()
    return jsonify(summary)


@app.route('/api/bills/yearly', methods=['GET'])
def api_get_yearly_bills():
    """获取年度账单汇总"""
    year = request.args.get('year', str(datetime.now().year))
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT mb.account_id, a.name as account_name,
               SUM(mb.total_amount) as yearly_amount,
               COUNT(DISTINCT mb.billing_cycle) as months_count
        FROM monthly_bills mb
        LEFT JOIN accounts a ON mb.account_id = a.id
        WHERE mb.billing_cycle LIKE ?
        GROUP BY mb.account_id
        ORDER BY mb.account_id
    ''', (f'{year}-%',))

    yearly_bills = [dict(row) for row in cursor.fetchall()]
    for item in yearly_bills:
        item['yearly_amount'] = round(item['yearly_amount'], 2)

    # 获取所有年份
    cursor.execute('SELECT DISTINCT substr(billing_cycle, 1, 4) as year FROM monthly_bills ORDER BY year DESC')
    available_years = [row['year'] for row in cursor.fetchall()]

    # 获取月度趋势
    cursor.execute('''
        SELECT billing_cycle, SUM(total_amount) as total_amount
        FROM monthly_bills
        WHERE billing_cycle LIKE ?
        GROUP BY billing_cycle
        ORDER BY billing_cycle
    ''', (f'{year}-%',))
    monthly_trend = [dict(row) for row in cursor.fetchall()]
    for item in monthly_trend:
        item['total_amount'] = round(item['total_amount'], 2)

    total_yearly = sum(item['yearly_amount'] for item in yearly_bills)

    conn.close()
    return jsonify({
        'year': year,
        'yearly_bills': yearly_bills,
        'monthly_trend': monthly_trend,
        'total_yearly': round(total_yearly, 2),
        'available_years': available_years
    })


# ---------- 账号余额 ----------

@app.route('/api/balance', methods=['GET'])
def api_get_balance():
    """获取所有账号余额"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT ab.*, a.name as account_name
        FROM account_balance ab
        LEFT JOIN accounts a ON ab.account_id = a.id
        ORDER BY ab.account_id
    ''')

    balances = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(balances)


# ---------- 首页 ----------

@app.route('/')
def index():
    return "阿里云资源平台后端服务运行中"


# ==================== RAM 用户管理 ====================

def _get_ram_client(account_id):
    """获取指定账号的 RAM 客户端"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT access_key_id, access_key_secret FROM accounts WHERE id = ?', (account_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None, '账号不存在'
    try:
        from alibabacloud_ram20150501.client import Client as RamClient
        from alibabacloud_tea_openapi import models as open_api_models
        config = open_api_models.Config(
            access_key_id=row['access_key_id'],
            access_key_secret=row['access_key_secret']
        )
        config.endpoint = 'ram.aliyuncs.com'
        return RamClient(config), None
    except ImportError:
        return None, 'RAM SDK 未安装，请运行 pip install alibabacloud_ram20150501'


@app.route('/api/accounts/<int:account_id>/ram/users', methods=['GET'])
def ram_list_users(account_id):
    """查询 RAM 用户列表"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_ram20150501 import models as ram_models
        from concurrent.futures import ThreadPoolExecutor, as_completed
        req = ram_models.ListUsersRequest()
        resp = client.list_users(req)
        users = []
        if resp.body and resp.body.users and resp.body.users.user:
            # 先构建基础用户信息
            for u in resp.body.users.user:
                users.append({
                    'user_name': u.user_name,
                    'user_principal_name': getattr(u, 'user_principal_name', '') or '',
                    'display_name': u.display_name,
                    'user_id': u.user_id,
                    'create_date': str(u.create_date) if u.create_date else '',
                    'comments': u.comments or '',
                    'access_keys': [],
                })
            # 并发获取每个用户的AccessKey
            def fetch_access_keys(user_name):
                try:
                    ak_req = ram_models.ListAccessKeysRequest(user_name=user_name)
                    ak_resp = client.list_access_keys(ak_req)
                    if ak_resp.body and ak_resp.body.access_keys and ak_resp.body.access_keys.access_key:
                        return user_name, [ak.access_key_id for ak in ak_resp.body.access_keys.access_key]
                except Exception:
                    pass
                return user_name, []
            with ThreadPoolExecutor(max_workers=min(10, len(users))) as executor:
                futures = {executor.submit(fetch_access_keys, u['user_name']): u for u in users}
                for future in as_completed(futures):
                    user_name, keys = future.result()
                    for u in users:
                        if u['user_name'] == user_name:
                            u['access_keys'] = keys
                            break
        return jsonify({'success': True, 'users': users})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 查询用户列表失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/users', methods=['POST'])
def ram_create_user(account_id):
    """创建 RAM 用户"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    data = request.get_json() or {}
    user_name = (data.get('user_name') or '').strip()
    display_name = (data.get('display_name') or '').strip()
    comments = (data.get('comments') or '').strip()
    if not user_name:
        return jsonify({'success': False, 'error': '用户名不能为空'}), 400
    try:
        from alibabacloud_ram20150501 import models as ram_models
        req = ram_models.CreateUserRequest(
            user_name=user_name,
            display_name=display_name or None,
            comments=comments or None
        )
        resp = client.create_user(req)
        log_operation('RAM管理', '创建用户', f'创建 RAM 用户：{user_name}', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({
            'success': True,
            'message': f'RAM 用户 {user_name} 创建成功',
            'user': {
                'user_name': resp.body.user.user_name,
                'display_name': resp.body.user.display_name,
                'user_id': resp.body.user.user_id,
            }
        })
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 创建用户失败: {e}\n{tb}')
        log_operation('RAM管理', '创建用户', f'创建 RAM 用户：{user_name}', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/users/<user_name>', methods=['DELETE'])
def ram_delete_user(account_id, user_name):
    """删除 RAM 用户"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_ram20150501 import models as ram_models
        req = ram_models.DeleteUserRequest(user_name=user_name)
        client.delete_user(req)
        log_operation('RAM管理', '删除用户', f'删除 RAM 用户：{user_name}', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': f'RAM 用户 {user_name} 已删除'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 删除用户失败: {e}\n{tb}')
        log_operation('RAM管理', '删除用户', f'删除 RAM 用户：{user_name}', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/users/<user_name>/policies', methods=['GET'])
def ram_list_user_policies(account_id, user_name):
    """查询 RAM 用户的权限策略列表"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_ram20150501 import models as ram_models
        req = ram_models.ListPoliciesForUserRequest(user_name=user_name)
        resp = client.list_policies_for_user(req)
        policies = []
        if resp.body and resp.body.policies and resp.body.policies.policy:
            for p in resp.body.policies.policy:
                policies.append({
                    'policy_name': p.policy_name,
                    'policy_type': p.policy_type,
                    'description': getattr(p, 'description', '') or '',
                    'attachment_date': '',  # SDK不支持获取授权时间
                })
        return jsonify({'success': True, 'policies': policies})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 查询用户权限失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/policies', methods=['GET'])
def ram_list_policies(account_id):
    """查询所有系统策略（用于下拉选择），并支持关键词过滤"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    policy_type = request.args.get('policy_type', 'System')
    keyword = request.args.get('keyword', '').strip().lower()
    try:
        from alibabacloud_ram20150501 import models as ram_models
        all_policies = []
        marker = None
        # 分页加载全部策略
        while True:
            req = ram_models.ListPoliciesRequest(
                policy_type=policy_type,
                max_items=100,
                marker=marker
            )
            resp = client.list_policies(req)
            if resp.body and resp.body.policies and resp.body.policies.policy:
                for p in resp.body.policies.policy:
                    name = p.policy_name or ''
                    desc = getattr(p, 'description', '') or ''
                    # 关键词过滤（匹配名称或描述）
                    if keyword and keyword not in name.lower() and keyword not in desc.lower():
                        continue
                    all_policies.append({
                        'policy_name': name,
                        'policy_type': p.policy_type,
                        'description': desc,
                    })
            # 检查是否还有下一页
            if resp.body and resp.body.is_truncated and resp.body.marker:
                marker = resp.body.marker
            else:
                break
            # 安全限制，最多加载10 页
            if len(all_policies) > 1000:
                break
        return jsonify({'success': True, 'policies': all_policies})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 查询策略列表失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/users/<user_name>/policies', methods=['POST'])
def ram_attach_policy(account_id, user_name):
    """为 RAM 用户添加权限策略"""
    # 禁止添加的高危权限
    BLOCKED_POLICIES = ['AdministratorAccess']
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    data = request.get_json() or {}
    policy_name = (data.get('policy_name') or '').strip()
    policy_type = (data.get('policy_type') or 'System').strip()
    if not policy_name:
        return jsonify({'success': False, 'error': '策略名称不能为空'}), 400
    if policy_name in BLOCKED_POLICIES:
        return jsonify({'success': False, 'error': f'禁止添加 {policy_name} 权限，该权限风险过高'}), 403
    try:
        from alibabacloud_ram20150501 import models as ram_models
        req = ram_models.AttachPolicyToUserRequest(
            policy_type=policy_type,
            policy_name=policy_name,
            user_name=user_name
        )
        client.attach_policy_to_user(req)
        log_operation('RAM管理', '添加权限', f'为用户 {user_name} 添加策略 {policy_name}', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': f'已为用户 {user_name} 添加策略 {policy_name}'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 添加权限失败: {e}\n{tb}')
        log_operation('RAM管理', '添加权限', f'为用户 {user_name} 添加策略 {policy_name}', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/users/<user_name>/policies/<policy_name>', methods=['DELETE'])
def ram_detach_policy(account_id, user_name, policy_name):
    """移除 RAM 用户的权限策略"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    policy_type = request.args.get('policy_type', 'System')
    try:
        from alibabacloud_ram20150501 import models as ram_models
        req = ram_models.DetachPolicyFromUserRequest(
            policy_type=policy_type,
            policy_name=policy_name,
            user_name=user_name
        )
        client.detach_policy_from_user(req)
        log_operation('RAM管理', '移除权限', f'移除用户 {user_name} 的策略 {policy_name}', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': f'已移除用户 {user_name} 的策略 {policy_name}'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 移除权限失败: {e}\n{tb}')
        log_operation('RAM管理', '移除权限', f'移除用户 {user_name} 的策略 {policy_name}', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/ram/users/<user_name>/password', methods=['POST'])
def ram_reset_password(account_id, user_name):
    """重置 RAM 用户密码"""
    client, err = _get_ram_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    data = request.get_json() or {}
    new_password = (data.get('password') or '').strip()
    if not new_password:
        return jsonify({'success': False, 'error': '密码不能为空'}), 400
    if len(new_password) < 8:
        return jsonify({'success': False, 'error': '密码长度至少 8 位'}), 400
    try:
        from alibabacloud_ram20150501 import models as ram_models
        # 先尝试更新登录配置，若不存在则创建
        try:
            req = ram_models.UpdateLoginProfileRequest(
                user_name=user_name,
                password=new_password
            )
            client.update_login_profile(req)
        except Exception as update_err:
            err_msg = str(update_err)
            if 'EntityNotExist' in err_msg or 'LoginProfile' in err_msg or 'not exist' in err_msg.lower():
                req = ram_models.CreateLoginProfileRequest(
                    user_name=user_name,
                    password=new_password
                )
                client.create_login_profile(req)
            else:
                raise update_err
        log_operation('RAM管理', '重置密码', f'重置用户 {user_name} 的密码', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': f'用户 {user_name} 密码已重置'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[RAM] 重置密码失败: {e}\n{tb}')
        log_operation('RAM管理', '重置密码', f'重置用户 {user_name} 的密码', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== 域名解析 DNS ====================

def _get_dns_client(account_id):
    """获取指定账号的 DNS 客户端"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT access_key_id, access_key_secret FROM accounts WHERE id = ?', (account_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None, '账号不存在'
    try:
        from alibabacloud_alidns20150109.client import Client as DnsClient
        from alibabacloud_tea_openapi import models as open_api_models
        config = open_api_models.Config(
            access_key_id=row['access_key_id'],
            access_key_secret=row['access_key_secret']
        )
        config.endpoint = 'alidns.aliyuncs.com'
        return DnsClient(config), None
    except ImportError:
        return None, 'DNS SDK 未安装，请运行 pip install alibabacloud_alidns20150109'


@app.route('/api/accounts/<int:account_id>/dns/domains', methods=['GET'])
def dns_list_domains(account_id):
    """查询域名列表，合并 DNS API + 域名 API（含到期时间）"""
    client, err = _get_dns_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_alidns20150109 import models as dns_models
        req = dns_models.DescribeDomainsRequest()
        resp = client.describe_domains(req)
        domains = []
        if resp.body and resp.body.domains and resp.body.domains.domain:
            for d in resp.body.domains.domain:
                domains.append({
                    'domain_name': d.domain_name,
                    'domain_id': d.domain_id,
                    'record_count': d.record_count if hasattr(d, 'record_count') else 0,
                    'create_time': str(d.create_time) if hasattr(d, 'create_time') and d.create_time else '',
                    'end_time': str(d.end_time) if hasattr(d, 'end_time') and d.end_time else '',
                    'version_name': d.version_name if hasattr(d, 'version_name') else '',
                    'status': d.domain_status if hasattr(d, 'domain_status') else '',
                })

        # 用域名 API 补充到期时间和持有者
        try:
            from alibabacloud_domain20180129.client import Client as DomainClient
            from alibabacloud_domain20180129 import models as domain_models
            from alibabacloud_tea_openapi import models as open_api_models

            row = query_db('SELECT access_key_id, access_key_secret FROM accounts WHERE id = ?', (account_id,), one=True)
            if row:
                cfg = open_api_models.Config(access_key_id=row['access_key_id'], access_key_secret=row['access_key_secret'])
                cfg.endpoint = 'domain.aliyuncs.com'
                domain_client = DomainClient(cfg)
                page = 1
                expiry_map = {}
                holder_map = {}
                while True:
                    qr = domain_models.QueryDomainListRequest(page_num=page, page_size=100)
                    dr = domain_client.query_domain_list(qr)
                    if not dr.body or not dr.body.data or not dr.body.data.domain:
                        break
                    for dom in dr.body.data.domain:
                        exp = getattr(dom, 'expiration_date_long', None) or getattr(dom, 'expiration_date', None)
                        if exp:
                            expiry_map[dom.domain_name] = str(exp)
                        holder = getattr(dom, 'ccompany', None) or getattr(dom, 'registrant_type', None)
                        if holder:
                            holder_map[dom.domain_name] = str(holder)
                    if dr.body.total_item_num and page * 100 >= dr.body.total_item_num:
                        break
                    page += 1
                # 合并到期时间和持有者
                for d in domains:
                    if not d['end_time'] and d['domain_name'] in expiry_map:
                        d['end_time'] = expiry_map[d['domain_name']]
                    if d['domain_name'] in holder_map:
                        d['holder'] = holder_map[d['domain_name']]
        except ImportError:
            print('[WARN] domain SDK 未安装，跳过到期时间和持有者')
        except Exception as e:
            print(f'[WARN] 域名 API 查询失败: {e}')

        return jsonify({'success': True, 'domains': domains})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[DNS] 查询域名列表失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/dns/domains/<domain_name>/records', methods=['GET'])
def dns_list_records(account_id, domain_name):
    """查询域名解析记录，支持分页和搜索"""
    client, err = _get_dns_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_alidns20150109 import models as dns_models
        keyword = request.args.get('keyword', '').strip()
        page_number = int(request.args.get('page_number', 1))
        page_size = int(request.args.get('page_size', 20))
        
        req = dns_models.DescribeDomainRecordsRequest(domain_name=domain_name)
        req.page_size = page_size
        req.page_number = page_number
        if keyword:
            req.key_word = keyword
        
        resp = client.describe_domain_records(req)
        records = []
        total = 0
        if resp.body:
            total = resp.body.total_count if hasattr(resp.body, 'total_count') else 0
            if resp.body.domain_records and resp.body.domain_records.record:
                for r in resp.body.domain_records.record:
                    records.append({
                        'record_id': r.record_id,
                        'rr': r.rr,
                        'type': r.type,
                        'value': r.value,
                        'ttl': r.ttl,
                        'priority': r.priority if hasattr(r, 'priority') else None,
                        'line': r.line if hasattr(r, 'line') else 'default',
                        'status': r.status if hasattr(r, 'status') else 'ENABLE',
                        'locked': r.lock if hasattr(r, 'lock') else False,
                    })
        return jsonify({'success': True, 'records': records, 'total': total, 'page_number': page_number, 'page_size': page_size})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[DNS] 查询解析记录失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/dns/domains/<domain_name>/records', methods=['POST'])
def dns_add_record(account_id, domain_name):
    """添加解析记录"""
    client, err = _get_dns_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    data = request.get_json() or {}
    rr = (data.get('rr') or '').strip()
    record_type = (data.get('type') or 'A').strip()
    value = (data.get('value') or '').strip()
    ttl = data.get('ttl', 600)
    priority = data.get('priority')
    line = data.get('line', 'default')
    if not rr:
        return jsonify({'success': False, 'error': '主机记录不能为空'}), 400
    if not value:
        return jsonify({'success': False, 'error': '记录值不能为空'}), 400
    try:
        from alibabacloud_alidns20150109 import models as dns_models
        req = dns_models.AddDomainRecordRequest(
            domain_name=domain_name,
            rr=rr,
            type=record_type,
            value=value,
            ttl=ttl,
            line=line,
        )
        if priority is not None:
            req.priority = priority
        resp = client.add_domain_record(req)
        log_operation('域名管理', '添加解析记录', f'{rr}.{domain_name} -> {value} ({record_type})', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': f'解析记录已添加 {rr}.{domain_name} -> {value}', 'record_id': resp.body.record_id})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[DNS] 添加解析记录失败: {e}\n{tb}')
        log_operation('域名管理', '添加解析记录', f'{rr}.{domain_name} -> {value} ({record_type})', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/dns/records/<record_id>', methods=['PUT'])
def dns_update_record(account_id, record_id):
    """更新解析记录"""
    client, err = _get_dns_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    data = request.get_json() or {}
    rr = (data.get('rr') or '').strip()
    record_type = (data.get('type') or 'A').strip()
    value = (data.get('value') or '').strip()
    ttl = data.get('ttl', 600)
    priority = data.get('priority')
    line = data.get('line', 'default')
    if not rr or not value:
        return jsonify({'success': False, 'error': '主机记录和记录值不能为空'}), 400
    try:
        from alibabacloud_alidns20150109 import models as dns_models
        req = dns_models.UpdateDomainRecordRequest(
            record_id=record_id,
            rr=rr,
            type=record_type,
            value=value,
            ttl=ttl,
            line=line,
        )
        if priority is not None:
            req.priority = priority
        client.update_domain_record(req)
        log_operation('域名管理', '更新解析记录', f'{rr} -> {value} ({record_type})', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': '解析记录已更新'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[DNS] 更新解析记录失败: {e}\n{tb}')
        log_operation('域名管理', '更新解析记录', f'{rr} -> {value} ({record_type})', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/dns/records/<record_id>', methods=['DELETE'])
def dns_delete_record(account_id, record_id):
    """删除解析记录"""
    client, err = _get_dns_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_alidns20150109 import models as dns_models
        req = dns_models.DeleteDomainRecordRequest(record_id=record_id)
        client.delete_domain_record(req)
        log_operation('域名管理', '删除解析记录', f'记录ID：{record_id}', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': '解析记录已删除'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[DNS] 删除解析记录失败: {e}\n{tb}')
        log_operation('域名管理', '删除解析记录', f'记录ID：{record_id}', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/dns/records/<record_id>/status', methods=['POST'])
def dns_set_record_status(account_id, record_id):
    """启用/暂停解析记录"""
    client, err = _get_dns_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    data = request.get_json() or {}
    status = data.get('status', 'ENABLE')
    try:
        from alibabacloud_alidns20150109 import models as dns_models
        if status == 'DISABLE':
            req = dns_models.SetDomainRecordStatusRequest(record_id=record_id, status='Disable')
        else:
            req = dns_models.SetDomainRecordStatusRequest(record_id=record_id, status='Enable')
        client.set_domain_record_status(req)
        log_operation('域名管理', f'{"启用" if status == "ENABLE" else "暂停"}解析记录', f'记录ID：{record_id}', account_id=account_id, account_name=get_account_name(account_id))
        return jsonify({'success': True, 'message': f'解析记录已{"启用" if status == "ENABLE" else "暂停"}'})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[DNS] 设置解析状态失败: {e}\n{tb}')
        log_operation('域名管理', f'{"启用" if status == "ENABLE" else "暂停"}解析记录', f'记录ID：{record_id}', account_id=account_id, account_name=get_account_name(account_id), success=False, error_msg=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== SSL 证书管理 ====================

def _get_cas_client(account_id):
    """获取指定账号的 SSL 证书客户端"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT access_key_id, access_key_secret FROM accounts WHERE id = ?', (account_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None, '账号不存在'
    try:
        from alibabacloud_cas20200407.client import Client as CasClient
        from alibabacloud_tea_openapi import models as open_api_models
        config = open_api_models.Config(
            access_key_id=row['access_key_id'],
            access_key_secret=row['access_key_secret']
        )
        config.endpoint = 'cas.aliyuncs.com'
        return CasClient(config), None
    except ImportError:
        return None, 'SSL SDK 未安装，请运行 pip install alibabacloud_cas20200407'


@app.route('/api/accounts/<int:account_id>/ssl/certificates', methods=['GET'])
def ssl_list_certificates(account_id):
    """查询 SSL 证书列表（V1.0 + V2.0）"""
    client, err = _get_cas_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    try:
        from alibabacloud_cas20200407 import models as cas_models
        import json
        
        certs = []
        seen_ids = set()
        
        # ===== V1.0: ListUserCertificateOrder =====
        try:
            req1 = cas_models.ListUserCertificateOrderRequest(
                current_page=1,
                show_size=100
            )
            resp1 = client.list_user_certificate_order(req1)
            if resp1.body and resp1.body.certificate_order_list:
                for c in resp1.body.certificate_order_list:
                    raw = {}
                    if hasattr(c, 'to_map'):
                        try:
                            raw = c.to_map()
                        except:
                            pass
                    if not raw:
                        for k, v in c.__dict__.items():
                            if not k.startswith('_') and v is not None:
                                raw[k] = v
                    
                    def _pick(d, *keys):
                        for k in keys:
                            if k in d and d[k] is not None and d[k] != '':
                                return d[k]
                        return ''
                    
                    cert_id = str(_pick(raw, 'CertificateId', 'Id', 'id'))
                    if cert_id and cert_id in seen_ids:
                        continue
                    seen_ids.add(cert_id)
                    
                    certs.append({
                        'id': cert_id,
                        'name': _pick(raw, 'Name', 'CertName'),
                        'domain': _pick(raw, 'Domain', 'CommonName'),
                        'status': _pick(raw, 'Status', 'CertStatus'),
                        'start_date': str(_pick(raw, 'StartDate', 'CertStartTime', 'BuyDate')),
                        'end_date': str(_pick(raw, 'EndDate', 'CertEndTime', 'ExpireDate')),
                        'cert_type': _pick(raw, 'CertificateType', 'CertType', 'Type'),
                        'issuer': _pick(raw, 'BrandName', 'CertBrand', 'Issuer'),
                    })
        except Exception as e:
            app.logger.warning(f'[SSL] V1.0 查询证书订单失败: {e}')
        
        # ===== V2.0: ListCertificates =====
        try:
            req2 = cas_models.ListCertificatesRequest(
                current_page=1,
                show_size=100
            )
            resp2 = client.list_certificates(req2)
            if resp2.body and resp2.body.certificate_list:
                for c in resp2.body.certificate_list:
                    raw = {}
                    if hasattr(c, 'to_map'):
                        try:
                            raw = c.to_map()
                        except:
                            pass
                    if not raw:
                        for k, v in c.__dict__.items():
                            if not k.startswith('_') and v is not None:
                                raw[k] = v
                    
                    def _pick2(d, *keys):
                        for k in keys:
                            if k in d and d[k] is not None and d[k] != '':
                                return d[k]
                        return ''
                    
                    cert_id = str(_pick2(raw, 'CertificateId', 'certificate_id'))
                    instance_id = str(_pick2(raw, 'InstanceId', 'instance_id'))
                    # 按CertificateId 去重，避免V1/V2 重复
                    if cert_id and cert_id in seen_ids:
                        continue
                    seen_ids.add(cert_id)
                    
                    # V2.0: NotBefore/NotAfter 秒时间戳
                    not_before = _pick2(raw, 'NotBefore', 'not_before')
                    not_after = _pick2(raw, 'NotAfter', 'not_after')
                    # V2.0: CertificateStatus: issued/revoked/willExpire/expired
                    cert_status = _pick2(raw, 'CertificateStatus', 'certificate_status')
                    # 映射状态为中文
                    status_map = {
                        'issued': '已签发', 'revoked': '已吊销',
                        'willExpire': '即将过期', 'expired': '已过期'
                    }
                    status = status_map.get(cert_status, cert_status)
                    # V2.0: CertificateSource: BUY/TEST/UPLOAD
                    source = _pick2(raw, 'CertificateSource', 'certificate_source')
                    cert_type_map = {'BUY': '正式证书', 'TEST': '测试证书', 'UPLOAD': '上传证书'}
                    cert_type = cert_type_map.get(source, source)
                    
                    certs.append({
                        'id': cert_id or instance_id,
                        'name': _pick2(raw, 'CertificateName', 'certificate_name', 'CommonName'),
                        'domain': _pick2(raw, 'Domain', 'CommonName'),
                        'status': status,
                        'start_date': str(not_before) if not_before else '',
                        'end_date': str(not_after) if not_after else '',
                        'cert_type': cert_type,
                        'issuer': _pick2(raw, 'Issuer', 'issuer'),
                    })
        except Exception as e:
            app.logger.warning(f'[SSL] V2.0 查询证书列表失败: {e}')
        
        return jsonify({'success': True, 'certificates': certs})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[SSL] 查询证书列表失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== 云监控 CloudMonitor ====================

def _get_cms_client(account_id):
    """获取指定账号的云监控客户端"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT access_key_id, access_key_secret FROM accounts WHERE id = ?', (account_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None, '账号不存在'
    try:
        from alibabacloud_cms20190101.client import Client as CmsClient
        from alibabacloud_tea_openapi import models as open_api_models
        config = open_api_models.Config(
            access_key_id=row['access_key_id'],
            access_key_secret=row['access_key_secret']
        )
        config.endpoint = 'metrics.aliyuncs.com'
        return CmsClient(config), None
    except ImportError:
        return None, 'CloudMonitor SDK 未安装，请运行 pip install alibabacloud_cms20190101'


@app.route('/api/accounts/<int:account_id>/monitor/metrics', methods=['GET'])
def monitor_get_metrics(account_id):
    """获取云监控指标数据"""
    client, err = _get_cms_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    
    namespace = request.args.get('namespace', 'acs_ecs_dashboard')
    metric_name = request.args.get('metric_name', 'CPUUtilization')
    dimensions = request.args.get('dimensions', '')
    period = request.args.get('period', '300')
    
    try:
        from alibabacloud_cms20190101 import models as cms_models
        import time
        
        end_time = int(time.time() * 1000)
        start_time = end_time - 3600 * 1000  # 1小时前
        
        req = cms_models.DescribeMetricLastRequest(
            namespace=namespace,
            metric_name=metric_name,
            period=period,
            start_time=str(start_time),
            end_time=str(end_time),
        )
        if dimensions:
            req.dimensions = dimensions
            
        resp = client.describe_metric_last(req)
        
        datapoints = []
        if resp.body and resp.body.datapoints:
            import json
            datapoints = json.loads(resp.body.datapoints)
            
        return jsonify({'success': True, 'datapoints': datapoints})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[Monitor] 获取监控数据失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/monitor/alarm', methods=['GET'])
def monitor_get_alarms(account_id):
    """获取告警规则列表"""
    client, err = _get_cms_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    
    try:
        from alibabacloud_cms20190101 import models as cms_models
        req = cms_models.DescribeMetricRuleListRequest(
            page=1,
            page_size=100
        )
        resp = client.describe_metric_rule_list(req)
        
        alarms = []
        if resp.body and resp.body.alarms and resp.body.alarms.alarm:
            for a in resp.body.alarms.alarm:
                alarms.append({
                    'rule_id': a.rule_id if hasattr(a, 'rule_id') else '',
                    'rule_name': a.rule_name if hasattr(a, 'rule_name') else '',
                    'namespace': a.namespace if hasattr(a, 'namespace') else '',
                    'metric_name': a.metric_name if hasattr(a, 'metric_name') else '',
                    'alarm_status': a.alert_status if hasattr(a, 'alert_status') else '',
                    'enable': a.enable if hasattr(a, 'enable') else True,
                })
                
        return jsonify({'success': True, 'alarms': alarms})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[Monitor] 获取告警规则失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/accounts/<int:account_id>/monitor/active-alarms', methods=['GET'])
def monitor_get_active_alarms(account_id):
    """获取当前正在告警的资源"""
    client, err = _get_cms_client(account_id)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    
    try:
        from alibabacloud_cms20190101 import models as cms_models
        import json
        
        # 获取告警历史（最近24小时内状态为ALARM的事件）
        import time
        end_time = int(time.time() * 1000)
        start_time = end_time - 24 * 3600 * 1000  # 24小时前
        
        req = cms_models.DescribeAlertHistoryListRequest(
            page_size=100,
            start_time=str(start_time),
            end_time=str(end_time),
        )
        resp = client.describe_alert_history_list(req)
        
        active_alarms = []
        seen = {}  # key: (namespace, metric_name, resource) -> index in active_alarms
        if resp.body and resp.body.alarm_history_list and resp.body.alarm_history_list.alarm_history:
            for h in resp.body.alarm_history_list.alarm_history:
                # 只保留仍在告警的，跳过已恢复的
                h_status = getattr(h, 'status', None)
                if h_status is not None:
                    # status可能是字符串"ALARM"/"OK"或整数 1=ALARM / 0=OK
                    status_str = str(h_status).upper()
                    if status_str not in ('ALARM', '1'):
                        continue

                # 解析资源维度
                resource_info = ''
                if hasattr(h, 'dimensions') and h.dimensions:
                    try:
                        dims = json.loads(h.dimensions)
                        if isinstance(dims, dict):
                            # 提取实例ID
                            resource_info = dims.get('instanceId', '') or dims.get('bucketName', '') or dims.get('port', '') or json.dumps(dims, ensure_ascii=False)
                        elif isinstance(dims, list) and len(dims) > 0:
                            d = dims[0]
                            resource_info = d.get('instanceId', '') or d.get('bucketName', '') or json.dumps(d, ensure_ascii=False)
                    except:
                        resource_info = h.dimensions

                alert_time = h.alert_time if hasattr(h, 'alert_time') and h.alert_time else 0
                key = (h.namespace or '', h.metric_name or '', resource_info)

                if key in seen:
                    # 已有此告警，比较时间戳，保留最新的
                    existing_time = active_alarms[seen[key]]['alarm_time_raw']
                    if alert_time and alert_time > existing_time:
                        active_alarms[seen[key]] = {
                            'rule_name': h.rule_name if hasattr(h, 'rule_name') else '',
                            'namespace': h.namespace if hasattr(h, 'namespace') else '',
                            'metric_name': h.metric_name if hasattr(h, 'metric_name') else '',
                            'expression': h.expression if hasattr(h, 'expression') else '',
                            'resource': resource_info,
                            'alarm_time': str(alert_time) if alert_time else '',
                            'alarm_time_raw': alert_time,
                            'last_time': h.last_time if hasattr(h, 'last_time') else '',
                            'value': h.value if hasattr(h, 'value') else '',
                        }
                else:
                    seen[key] = len(active_alarms)
                    active_alarms.append({
                        'rule_name': h.rule_name if hasattr(h, 'rule_name') else '',
                        'namespace': h.namespace if hasattr(h, 'namespace') else '',
                        'metric_name': h.metric_name if hasattr(h, 'metric_name') else '',
                        'expression': h.expression if hasattr(h, 'expression') else '',
                        'resource': resource_info,
                        'alarm_time': str(alert_time) if alert_time else '',
                        'alarm_time_raw': alert_time,
                        'last_time': h.last_time if hasattr(h, 'last_time') else '',
                        'value': h.value if hasattr(h, 'value') else '',
                    })

        # 按告警时间降序（最新在前）
        active_alarms.sort(key=lambda x: x.get('alarm_time_raw', 0) or 0, reverse=True)
        # 移除内部排序字段
        for a in active_alarms:
            a.pop('alarm_time_raw', None)
                
        return jsonify({'success': True, 'active_alarms': active_alarms})
    except Exception as e:
        tb = traceback.format_exc()
        app.logger.error(f'[Monitor] 获取活跃告警失败: {e}\n{tb}')
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== 定期同步调度 ====================

# 全局调度器
scheduler = BackgroundScheduler()
_sync_job_id = 'auto_sync_all'


def auto_sync_all_accounts():
    """定时任务：同步所有账号"""
    try:
        app.logger.info("[定期同步] 开始定时同步所有账号...")
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, name FROM accounts')
        accounts = cursor.fetchall()
        conn.close()

        results = []
        for acct in accounts:
            try:
                result = do_sync_account(acct['id'])
                results.append(f"{acct['name']}: {'成功' if result.get('success') else '失败'}")
                app.logger.info(f"[定期同步] {acct['name']} 同步完成")
            except Exception as e:
                results.append(f"{acct['name']}: 异常-{str(e)}")
                app.logger.error(f"[定期同步] {acct['name']} 同步异常: {str(e)}")

        # 更新最后同步时间
        execute_db('UPDATE auto_sync_config SET last_sync_at = ?, updated_at = ? WHERE id = 1',
                   (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), datetime.now()))
        app.logger.info(f"[定期同步] 全部完成: {', '.join(results)}")
    except Exception as e:
        app.logger.error(f"[定期同步] 整体异常: {str(e)}")


def update_scheduler():
    """根据数据库配置更新调度器"""
    global scheduler
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT enabled, interval_hours FROM auto_sync_config WHERE id = 1')
        row = cursor.fetchone()
        conn.close()

        if not row:
            return

        enabled = bool(row['enabled'])
        interval_hours = row['interval_hours'] or 6

        # 移除现有job
        if scheduler.get_job(_sync_job_id):
            scheduler.remove_job(_sync_job_id)

        # 如果启用，添加新job（每个整点同步）
        if enabled:
            scheduler.add_job(
                auto_sync_all_accounts,
                'cron',
                minute=0,
                id=_sync_job_id,
                replace_existing=True
            )
            app.logger.info("[定期同步] 已启用，每个整点同步")
        else:
            app.logger.info("[定期同步] 已禁用")

    except Exception as e:
        app.logger.error(f"更新调度器失败: {str(e)}")


@app.route('/api/auto-sync', methods=['GET'])
def api_get_auto_sync():
    """获取定期同步配置"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT enabled, interval_hours, last_sync_at, updated_at FROM auto_sync_config WHERE id = 1')
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({'enabled': False, 'interval_hours': 6, 'last_sync_at': None})
    return jsonify(dict(row))


@app.route('/api/auto-sync', methods=['PUT'])
def api_update_auto_sync():
    """更新定期同步配置"""
    data = request.get_json()
    enabled = data.get('enabled', False)
    interval_hours = data.get('interval_hours', 6)

    if interval_hours < 1:
        return jsonify({'error': '同步间隔不能小于1小时'}), 400
    if interval_hours > 168:
        return jsonify({'error': '同步间隔不能超过168小时(7天)'}), 400

    execute_db(
        'UPDATE auto_sync_config SET enabled = ?, interval_hours = ?, updated_at = ? WHERE id = 1',
        (1 if enabled else 0, interval_hours, datetime.now())
    )

    # 更新调度器
    update_scheduler()

    msg = f'定期同步已启用，间隔 {interval_hours} 小时' if enabled else '定期同步已禁用'
    log_operation('系统设置', '更新定期同步', msg)
    return jsonify({'success': True, 'message': msg})


# ---------- 默认区域管理 ----------

def get_default_regions():
    """获取默认区域列表"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT region_id FROM default_regions ORDER BY sort_order, id')
    regions = [row['region_id'] for row in cursor.fetchall()]
    conn.close()
    return regions if regions else ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-chengdu', 'ap-southeast-1']


@app.route('/api/default-regions', methods=['GET'])
def api_get_default_regions():
    """获取默认区域列表"""
    regions = get_default_regions()
    return jsonify({'regions': regions})


@app.route('/api/default-regions', methods=['POST'])
def api_update_default_regions():
    """更新默认区域列表"""
    data = request.get_json()
    regions = data.get('regions', [])
    
    if not regions:
        return jsonify({'error': '至少需要一个区域'}), 400

    conn = get_db()
    cursor = conn.cursor()
    # 清空现有区域
    cursor.execute('DELETE FROM default_regions')
    # 插入新区域
    for i, region in enumerate(regions):
        cursor.execute('INSERT INTO default_regions (region_id, sort_order) VALUES (?, ?)', (region.strip(), i))
    conn.commit()
    conn.close()

    log_operation('系统设置', '更新默认区域', f'已更新为: {', '.join(regions)}')
    return jsonify({'success': True, 'message': f'默认区域已更新，共 {len(regions)} 个区域'})


# ---------- 操作日志 ----------

@app.route('/api/logs', methods=['GET'])
def api_get_logs():
    """查询操作日志（支持按账号、模块、关键词、时间范围过滤，分页）"""
    account_id = request.args.get('account_id', '')
    module = request.args.get('module', '')
    keyword = request.args.get('keyword', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()
    try:
        page = max(1, int(request.args.get('page', 1)))
    except ValueError:
        page = 1
    try:
        page_size = min(200, max(1, int(request.args.get('page_size', 50))))
    except ValueError:
        page_size = 50

    where = []
    args = []
    if account_id:
        where.append('account_id = ?')
        args.append(int(account_id))
    if module:
        where.append('module = ?')
        args.append(module)
    if keyword:
        where.append('(action LIKE ? OR detail LIKE ? OR account_name LIKE ?)')
        kw = f'%{keyword}%'
        args.extend([kw, kw, kw])
    if date_from:
        where.append('created_at >= ?')
        args.append(f'{date_from} 00:00:00')
    if date_to:
        where.append('created_at <= ?')
        args.append(f'{date_to} 23:59:59')

    where_sql = (' WHERE ' + ' AND '.join(where)) if where else ''

    try:
        total = query_db(f'SELECT COUNT(*) AS c FROM operation_logs{where_sql}', tuple(args), one=True)['c']
        rows = query_db(
            f'SELECT * FROM operation_logs{where_sql} ORDER BY id DESC LIMIT ? OFFSET ?',
            tuple(args) + (page_size, (page - 1) * page_size)
        )
        modules = [r['module'] for r in query_db('SELECT DISTINCT module FROM operation_logs ORDER BY module')]
        return jsonify({
            'logs': [dict(r) for r in rows],
            'total': total,
            'page': page,
            'page_size': page_size,
            'modules': modules,
        })
    except Exception as e:
        return jsonify({'error': f'查询日志失败: {str(e)}'}), 500


@app.route('/api/logs', methods=['DELETE'])
def api_clear_logs():
    """清空操作日志"""
    try:
        execute_db('DELETE FROM operation_logs')
        log_operation('系统设置', '清空日志', '清空全部操作日志')
        return jsonify({'success': True, 'message': '日志已清空'})
    except Exception as e:
        return jsonify({'error': f'清空日志失败: {str(e)}'}), 500


# 初始化时启动调度器
# 注意：必须在 __main__ 保护下或设置 reloader 环境变量，避免debug 模式下重复启动
import os as _os

def start_scheduler():
    """启动调度器，仅在非 reloader 父进程时启动"""
    init_db()  # 确保表已创建
    update_scheduler()
    # 添加每日备份任务（凌晨3点）
    if not scheduler.get_job('db_backup'):
        scheduler.add_job(
            backup_database,
            'cron',
            hour=3,
            minute=0,
            id='db_backup',
            replace_existing=True
        )
        app.logger.info("[备份] 已添加每日数据库备份任务（凌晨3:00）")
    # 添加同步任务清理（每 30 分钟）
    if not scheduler.get_job('cleanup_sync_tasks'):
        scheduler.add_job(
            cleanup_sync_tasks,
            'interval',
            minutes=30,
            id='cleanup_sync_tasks',
            replace_existing=True
        )
        app.logger.info("[清理] 已添加同步任务定期清理（30分钟）")
    if not scheduler.running:
        scheduler.start()
        app.logger.info("[调度器] 调度器已启动")

# 在非 debug 模式下直接启动，debug 模式下仅由 reloader 子进程启动
if not app.debug or _os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    start_scheduler()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    # 如果使用 debug 模式，调度器由上面的 WERKZEUG_RUN_MAIN 检查保证
    # 推荐生产环境使用 debug=False
    app.run(host='0.0.0.0', port=port, debug=False)
