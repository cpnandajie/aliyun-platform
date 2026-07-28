import { useState, useEffect, useCallback, useMemo, Fragment, Component, createContext, useContext, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import './App.css'

// 设置 axios 默认超时：同步操作可能耗时较长，请设置 10 分钟
axios.defaults.timeout = 600000

// ==================== 错误边界 ====================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444' }}>页面出错了</h2>
          <p style={{ color: '#666', marginTop: 12 }}>{this.state.error?.message || '未知错误'}</p>
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ==================== Toast 通知系统 ====================
const ToastContext = createContext(null)

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const addToast = useCallback((msg, type = 'info', duration = 3000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, msg, type, duration }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useMemo(() => ({
    success: (msg, dur) => addToast(msg, 'success', dur ?? 3000),
    error: (msg, dur) => addToast(msg, 'error', dur ?? 4000),
    warning: (msg, dur) => addToast(msg, 'warning', dur ?? 3000),
    info: (msg, dur) => addToast(msg, 'info', dur ?? 3000),
  }), [addToast])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
            <span className="toast-icon">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : t.type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span className="toast-msg">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const useToast = () => useContext(ToastContext)

// ==================== 确认弹框 ====================
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-icon">⚠</div>
        <p className="modal-msg">{message}</p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onConfirm}>确定</button>
          <button className="btn-default" onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  )
}

// ==================== 全局 Loading 条====================
function LoadingBar() {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const show = () => {
      clearTimeout(timerRef.current)
      setVisible(true)
    }
    const hide = () => {
      timerRef.current = setTimeout(() => setVisible(false), 200)
    }
    window.__showLoading = show
    window.__hideLoading = hide
    return () => { clearTimeout(timerRef.current) }
  }, [])

  return visible ? <div className="global-loading-bar"><div className="global-loading-progress" /></div> : null
}

// 金额千分位格式化
const fmtMoney = (n) => {
  const num = typeof n === 'number' ? n : parseFloat(n) || 0
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 日期格式化：截取前19位，将 T 替换为空格，去除时区后缀
const fmtDate = (d) => {
  if (!d) return '-'
  const s = String(d).trim()
  // 已是标准格式直接返回
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s
  // Unix 时间戳（纯数字，10位秒级或13位毫秒级）
  if (/^\d{10,13}$/.test(s)) {
    const ts = s.length === 10 ? Number(s) * 1000 : Number(s)
    const dt = new Date(ts)
    if (!isNaN(dt.getTime())) {
      const pad = (n) => String(n).padStart(2, '0')
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
    }
  }
  // ISO格式或带时区的字符串，截取前19位并替换T
  return s.slice(0, 19).replace('T', ' ') || '-'
}

// ==================== 侧边栏组件====================
function Sidebar({ activeMenu, onMenuChange }) {
  const menus = [
    { key: 'overview', label: '资源概览', icon: '' },
    { key: 'resources', label: '资源管理', icon: '' },
    { key: 'bills', label: '账单管理', icon: '' },
    { key: 'accounts', label: '账号管理', icon: '' },
    { key: 'ram', label: 'RAM 管理', icon: '' },
    { key: 'dns', label: '域名管理', icon: '' },
    { key: 'ssl', label: 'SSL 证书', icon: '' },
    { key: 'monitor', label: '云监控', icon: '' },
    { key: 'logs', label: '日志管理', icon: '' },
  ]

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">阿里云资源平台</span>
      </div>
      <nav className="sidebar-nav">
        {menus.map(menu => (
          <div
            key={menu.key}
            className={`sidebar-menu-item ${activeMenu === menu.key ? 'active' : ''}`}
            onClick={() => onMenuChange(menu.key)}
          >
            <span className="menu-label">{menu.label}</span>
          </div>
        ))}
      </nav>
    </div>
  )
}

// ==================== 资源概览页面 ====================
function ResourceOverview() {
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    axios.get('/api/overview')
      .then(res => setOverview(res.data))
      .catch(err => console.error('加载概览失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalEcs = overview.reduce((s, a) => s + a.ecs_count, 0)
  const totalRds = overview.reduce((s, a) => s + a.rds_count, 0)
  const totalSlb = overview.reduce((s, a) => s + a.slb_count, 0)
  const totalOss = overview.reduce((s, a) => s + a.oss_count, 0)
  const totalRedis = overview.reduce((s, a) => s + a.redis_count, 0)
  const totalMonthAmount = overview.reduce((s, a) => s + a.month_amount, 0)
  const totalBalance = overview.reduce((s, a) => s + a.available_amount, 0)

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>资源概览</h2>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          {loading ? '刷新中..' : '刷新'}
        </button>
      </div>

      {/* 汇总卡片*/}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-value">{totalEcs}</div>
          <div className="card-label">ECS实例</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{totalRds}</div>
          <div className="card-label">RDS实例</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{totalSlb}</div>
          <div className="card-label">SLB实例</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{totalOss}</div>
          <div className="card-label">OSS Bucket</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{totalRedis}</div>
          <div className="card-label">Redis实例</div>
        </div>
        <div className="summary-card highlight">
          <div className="card-value">¥{fmtMoney(totalMonthAmount)}</div>
          <div className="card-label">本月消费</div>
        </div>
        <div className={`summary-card balance${totalBalance < 20000 ? ' low' : ''}`}>
          <div className="card-value">¥{fmtMoney(totalBalance)}</div>
          <div className="card-label">可用额度</div>
        </div>
      </div>

      {/* 详情 */}
      <div className="section-block">
        <h3>各账号资源</h3>
        {overview.length === 0 ? (
          <div className="empty-state">暂无数据，请先在账号管理中添加阿里云账号并同步数据</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>账号名称</th>
                  <th>备注</th>
                  <th>ECS</th>
                  <th>RDS</th>
                  <th>SLB</th>
                  <th>OSS</th>
                  <th>Redis</th>
                  <th>本月消费</th>
                  <th>可用额度</th>
                </tr>
              </thead>
              <tbody>
                {overview.map(item => (
                  <tr key={item.account_id}>
                    <td>{item.account_name}</td>
                    <td>{item.remark || '-'}</td>
                    <td>{item.ecs_count}</td>
                    <td>{item.rds_count}</td>
                    <td>{item.slb_count}</td>
                    <td>{item.oss_count}</td>
                    <td>{item.redis_count}</td>
                    <td className="td-amount">¥{fmtMoney(item.month_amount)}</td>
                    <td className={item.available_amount < 20000 ? 'td-amount-danger' : 'td-amount'}>¥{fmtMoney(item.available_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="page-note">* 当账号的可用额度小于 2 万元时，将以<span style={{ color: '#ef4444', fontWeight: 600 }}>红色</span>显示，请及时关注余额。</div>
    </div>
  )
}

// ==================== 资源管理页面 ====================
function ResourceManagement() {
  const [activeTab, setActiveTab] = useState('ecs')
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState('')
  const [sortDir, setSortDir] = useState('asc')
  const [regions, setRegions] = useState([])

  // 各Tab的列定义（sortable标记可排序列）
  const tabColumns = {
    ecs: [
      { key: 'account_name', label: '账号', sortable: true },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{v}</span> },
      { key: 'instance_type', label: '规格', sortable: true },
      { key: 'cpu', label: 'CPU', sortable: true },
      { key: 'memory_gb', label: '内存(GB)', sortable: true },
      { key: 'private_ip', label: '内网IP' },
      { key: 'public_ip', label: '公网IP' },
      { key: 'region_id', label: '区域', sortable: true },
    ],
    rds: [
      { key: 'account_name', label: '账号', sortable: true },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'engine', label: '引擎', sortable: true },
      { key: 'engine_version', label: '版本', sortable: true },
      { key: 'instance_type', label: '规格', sortable: true },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{v}</span> },
      { key: 'region_id', label: '区域', sortable: true },
    ],
    slb: [
      { key: 'account_name', label: '账号', sortable: true },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'address', label: '地址', className: 'td-mono' },
      { key: 'address_type', label: '地址类型', sortable: true },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{v}</span> },
      { key: 'network_type', label: '网络类型', sortable: true },
      { key: 'region_id', label: '区域', sortable: true },
    ],
    oss: [
      { key: 'account_name', label: '账号', sortable: true },
      { key: 'bucket_name', label: 'Bucket名称', sortable: true, className: 'td-mono' },
      { key: 'location', label: '区域', sortable: true },
      { key: 'storage_class', label: '存储类型', sortable: true },
      { key: 'creation_date', label: '创建时间', sortable: true, render: v => fmtDate(v) },
    ],
    redis: [
      { key: 'account_name', label: '账号', sortable: true },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'architecture_type', label: '架构', sortable: true },
      { key: 'capacity', label: '容量', sortable: true },
      { key: 'engine_version', label: '版本', sortable: true },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{v}</span> },
      { key: 'connection_domain', label: '连接地址', className: 'td-mono' },
      { key: 'region_id', label: '区域', sortable: true },
    ],
  }

  const REGION_LABELS = {
    'cn-hangzhou': '杭州窞', 'cn-shanghai': '上海', 'cn-beijing': '北京',
    'cn-chengdu': '成都', 'ap-southeast-1': '新加坡', 'cn-shenzhen': '深圳',
    'cn-zhangjiakou': '张家口', 'cn-huhehaote': '呼和浩特', 'cn-wulanchabu': '乌兰察布',
    'cn-qingdao': '青岛', 'cn-guangzhou': '广州', 'cn-fuzhou': '福州',
    'cn-heyuan': '河源', 'ap-southeast-5': '雅加达', 'ap-southeast-3': '吉隆坡',
    'us-east-1': '美东', 'us-west-1': '美西', 'eu-central-1': '法兰克福',
  }

  useEffect(() => {
    axios.get('/api/accounts')
      .then(res => setAccounts(res.data))
      .catch(err => console.error('加载账号失败:', err))
  }, [])

  useEffect(() => {
    axios.get('/api/regions')
      .then(res => setRegions(res.data))
      .catch(() => setRegions(['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-chengdu', 'ap-southeast-1']))
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (selectedAccount) params.account_id = selectedAccount
    if (keyword) params.keyword = keyword
    if (statusFilter) params.status = statusFilter
    if (regionFilter) params.region = regionFilter

    axios.get(`/api/${activeTab}`, { params })
      .then(res => setData(res.data))
      .catch(err => console.error('加载数据失败:', err))
      .finally(() => setLoading(false))
  }, [activeTab, selectedAccount, keyword, statusFilter, regionFilter])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => { loadData() }
  const handleReset = () => {
    setSelectedAccount('')
    setKeyword('')
    setStatusFilter('')
    setRegionFilter('')
    setSortKey('')
    setSortDir('asc')
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // 排序后的数据
  const sortedData = (() => {
    if (!sortKey) return data
    const cols = tabColumns[activeTab]
    const col = cols.find(c => c.key === sortKey)
    if (!col || !col.sortable) return data
    const arr = [...data]
    arr.sort((a, b) => {
      let va, vb
      if (sortKey === 'memory_gb' && activeTab === 'ecs') {
        va = (a.memory || 0) / 1024
        vb = (b.memory || 0) / 1024
      } else if (sortKey === 'capacity' && activeTab === 'redis') {
        va = parseFloat(a.capacity) || 0
        vb = parseFloat(b.capacity) || 0
      } else if (sortKey === 'creation_date' && activeTab === 'oss') {
        va = fmtDate(a.creation_date)
        vb = fmtDate(b.creation_date)
      } else {
        va = a[sortKey] ?? ''
        vb = b[sortKey] ?? ''
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const sa = String(va), sb = String(vb)
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
    return arr
  })()

  const getCellContent = (item, col) => {
    if (col.key === 'memory_gb' && activeTab === 'ecs') {
      return item.memory ? (item.memory / 1024).toFixed(item.memory % 1024 === 0 ? 0 : 1) : '-'
    }
    if (col.key === 'capacity' && activeTab === 'redis') {
      if (!item.capacity) return '-'
      const mb = parseFloat(item.capacity)
      return mb < 1024 ? `${mb}M` : `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)}G`
    }
    const raw = item[col.key]
    if (col.render) return col.render(raw)
    return raw || '-'
  }

  const sortArrow = (key) => {
    if (sortKey !== key) return <span className="sort-arrow"> ↕</span>
    return <span className="sort-arrow active"> {sortDir === 'asc' ? '↓' : '↑'}</span>
  }

  const tabs = [
    { key: 'ecs', label: 'ECS' },
    { key: 'rds', label: 'RDS' },
    { key: 'slb', label: 'SLB' },
    { key: 'oss', label: 'OSS' },
    { key: 'redis', label: 'Redis' },
  ]

  const renderTable = () => {
    if (data.length === 0) {
      return <div className="empty-state">暂无数据</div>
    }
    const cols = tabColumns[activeTab]
    return (
      <table className="data-table">
        <thead>
          <tr>
            {cols.map(col => (
              <th
                key={col.key}
                className={col.sortable ? 'sortable' : ''}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}{col.sortable && sortArrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((item, idx) => (
            <tr key={idx}>
              {cols.map(col => (
                <td key={col.key} className={col.className || (['cpu', 'memory_gb', 'months_count'].includes(col.key) ? 'td-center' : undefined)}>
                  {getCellContent(item, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>资源管理</h2>
      </div>

      {/* 资源类型Tab */}
      <div className="resource-tabs">
        {tabs.map(tab => (
          <div
            key={tab.key}
            className={`resource-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.key); setKeyword(''); setSelectedAccount(''); setSortKey(''); }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* 搜索框*/}
      <div className="search-bar">
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="">全部账号</option>
          {accounts.map(acct => (
            <option key={acct.id} value={acct.id}>{acct.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          {activeTab === 'ecs' && <>
            <option value="Running">运行中</option>
            <option value="Stopped">已停止</option>
            <option value="Starting">启动中</option>
            <option value="Stopping">停止中</option>
          </>}
          {activeTab === 'rds' && <>
            <option value="Running">运行中</option>
            <option value="Stopped">已停止</option>
            <option value="Creating">创建中</option>
          </>}
          {activeTab === 'slb' && <>
            <option value="active">活跃</option>
            <option value="inactive">不活跃</option>
          </>}
          {activeTab === 'redis' && <>
            <option value="Normal">正常</option>
            <option value="Creating">创建中</option>
            <option value="Changing">变配中</option>
            <option value="Inactive">停用</option>
          </>}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="">全部区域</option>
          {regions.map(r => (
            <option key={r} value={r}>{REGION_LABELS[r] || r}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="搜索实例ID / IP / 名称..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>
          {loading ? '查询中..' : '搜索'}
        </button>
        <button className="btn-default" onClick={handleReset}>重置</button>
      </div>

      {/* 数据表格 */}
      <div className="section-block">
        <div className="table-info">共{data.length} 条记录{sortKey ? '(已排序)' : ''}</div>
        <div className="overview-table-wrap">
          {renderTable()}
        </div>
      </div>
    </div>
  )
}

// ==================== 账单管理页面 ====================
function BillManagement() {
  const [billingCycle, setBillingCycle] = useState('')
  const [availableCycles, setAvailableCycles] = useState([])
  const [bills, setBills] = useState([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  // 年度汇总
  const [yearlyView, setYearlyView] = useState(false)
  const [yearlyYear, setYearlyYear] = useState(new Date().getFullYear().toString())
  const [yearlyData, setYearlyData] = useState({ yearly_bills: [], monthly_trend: [], total_yearly: 0, available_years: [] })
  const [yearlySort, setYearlySort] = useState({ key: '', dir: 'asc' })
  const [detailSort, setDetailSort] = useState({ key: '', dir: 'asc' })

  const loadData = useCallback((cycle) => {
    setLoading(true)
    const targetCycle = cycle || billingCycle
    axios.get('/api/bills', { params: { billing_cycle: targetCycle } })
      .then(res => {
        setBills(res.data.bills)
        setTotalAmount(res.data.total_amount)
        setAvailableCycles(res.data.available_cycles)
      })
      .catch(err => console.error('加载账单失败:', err))
      .finally(() => setLoading(false))
  }, [billingCycle])

  useEffect(() => {
    const now = new Date()
    const currentCycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setBillingCycle(currentCycle)
    loadData(currentCycle)
  }, [])

  const handleCycleChange = (cycle) => {
    setBillingCycle(cycle)
    setSelectedBill(null)
    loadData(cycle)
  }

  const loadYearlyData = useCallback((year) => {
    setLoading(true)
    const targetYear = year || yearlyYear
    axios.get('/api/bills/yearly', { params: { year: targetYear } })
      .then(res => setYearlyData(res.data))
      .catch(err => console.error('加载年度汇总失败', err))
      .finally(() => setLoading(false))
  }, [yearlyYear])

  const handleYearChange = (year) => {
    setYearlyYear(year)
    loadYearlyData(year)
  }

  const showBillDetail = (bill) => {
    setSelectedBill(selectedBill && selectedBill.account_id === bill.account_id ? null : bill)
  }

  const handleYearlySort = (key) => {
    setYearlySort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  const handleDetailSort = (key) => {
    setDetailSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  const sortArrowFor = (sort, key) => {
    if (sort.key !== key) return <span className="sort-arrow"> ↕</span>
    return <span className="sort-arrow active"> {sort.dir === 'asc' ? '↓' : '↑'}</span>
  }
  const getSorted = (arr, sort) => {
    if (!sort.key) return arr
    const sorted = [...arr]
    sorted.sort((a, b) => {
      let va = a[sort.key] ?? '', vb = b[sort.key] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') return sort.dir === 'asc' ? va - vb : vb - va
      return sort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
    return sorted
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>账单管理</h2>
        <div className="header-actions">
          <button
            className={yearlyView ? 'btn-default' : 'btn-primary'}
            onClick={() => { setYearlyView(false) }}
          >
            月度账单
          </button>
          <button
            className={yearlyView ? 'btn-primary' : 'btn-default'}
            onClick={() => { setYearlyView(true); loadYearlyData() }}
          >
            年度汇总
          </button>
        </div>
      </div>

      {!yearlyView ? (
      <>
      {/* 账单月份选择 */}
      <div className="section-block">
        <div className="search-bar" style={{ marginBottom: 12 }}>
          <label>账单月份：</label>
          <input
            type="month"
            value={billingCycle}
            onChange={e => handleCycleChange(e.target.value)}
          />
          <button className="btn-primary" onClick={() => loadData()} disabled={loading}>
            {loading ? '查询中..' : '查询'}
          </button>
        </div>
        {availableCycles.length > 0 && (
          <div className="cycle-chips">
            {availableCycles.map(cycle => (
              <span
                key={cycle}
                className={`cycle-chip ${billingCycle === cycle ? 'active' : ''}`}
                onClick={() => handleCycleChange(cycle)}
              >
                {cycle}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 汇总?*/}
      <div className="summary-cards">
        <div className="summary-card highlight">
          <div className="card-value">¥{fmtMoney(totalAmount)}</div>
          <div className="card-label">{billingCycle} 所有账号消费总额</div>
        </div>
      </div>

      {/* 各账号账单*/}
      <div className="section-block">
        <h3>{billingCycle} 各账号账单</h3>
        {bills.length === 0 ? (
          <div className="empty-state">暂无账单数据，请先同步数据</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>账号名称</th>
                  <th>账单月份</th>
                  <th>消费总额</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(bill => (
                  <Fragment key={bill.account_id}>
                    <tr>
                      <td>{bill.account_name}</td>
                      <td>{bill.billing_cycle}</td>
                      <td className="td-amount">¥{fmtMoney(bill.total_amount)}</td>
                      <td>{bill.updated_at}</td>
                      <td>
                        <button className="btn-link" onClick={() => showBillDetail(bill)}>
                          {selectedBill && selectedBill.account_id === bill.account_id ? '收起' : '查看明细'}
                        </button>
                      </td>
                    </tr>
                    {selectedBill && selectedBill.account_id === bill.account_id && bill.details && bill.details.length > 0 && (
                      <tr key={`detail-${bill.account_id}`}>
                        <td colSpan="5" style={{ padding: 0 }}>
                          <div className="bill-detail-panel">
                            <table className="data-table inner-table">
                              <thead>
                                <tr>
                                  <th className="sortable" onClick={() => handleDetailSort('product_code')}>产品类型{sortArrowFor(detailSort, 'product_code')}</th>
                                  <th className="sortable" onClick={() => handleDetailSort('product_detail')}>产品明细{sortArrowFor(detailSort, 'product_detail')}</th>
                                  <th className="sortable" onClick={() => handleDetailSort('pretax_amount')}>应付金额{sortArrowFor(detailSort, 'pretax_amount')}</th>
                                  <th className="sortable" onClick={() => handleDetailSort('cash_amount')}>现金支付额{sortArrowFor(detailSort, 'cash_amount')}</th>
                                  <th className="sortable" onClick={() => handleDetailSort('deduct_amount')}>代金券抵扣{sortArrowFor(detailSort, 'deduct_amount')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getSorted(bill.details, detailSort).map((d, i) => (
                                  <tr key={i}>
                                    <td>{d.product_code || '-'}</td>
                                    <td>{d.product_detail || d.product_type || '-'}</td>
                                    <td className="td-amount">¥{fmtMoney(d.pretax_amount || 0)}</td>
                                    <td className="td-amount">¥{fmtMoney(d.cash_amount || 0)}</td>
                                    <td className="td-amount">¥{fmtMoney(d.deduct_amount || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
                }
              </tbody>
            </table>
          </div>
        )}
      </div>


      </>
      ) : (
      <>
      {/* 年度汇总视图 */}
      <div className="search-bar">
        <label>选择年份：</label>
        {yearlyData.available_years.length > 0 ? (
          yearlyData.available_years.map(y => (
            <span
              key={y}
              className={`cycle-chip ${yearlyYear === y ? 'active' : ''}`}
              onClick={() => handleYearChange(y)}
            >
              {y}年
            </span>
          ))
        ) : (
          <span className="cycle-chip active">{yearlyYear}年</span>
        )}
      </div>

      <div className="summary-cards">
        <div className="summary-card highlight">
          <div className="card-value">¥{fmtMoney(yearlyData.total_yearly)}</div>
          <div className="card-label">{yearlyYear}年消费总额</div>
        </div>
      </div>

      {/* 月度趋势图表 */}
      {yearlyData.monthly_trend.length > 0 && (() => {
        const maxAmount = Math.max(...yearlyData.monthly_trend.map(m => m.total_amount), 1)
        return (
          <div className="section-block">
            <h3>{yearlyYear}年月度消费趋势</h3>
            <div className="bar-chart">
              {yearlyData.monthly_trend.map(m => {
                const pct = Math.max((m.total_amount / maxAmount) * 100, 2)
                const month = m.billing_cycle.split('-')[1]
                return (
                  <div key={m.billing_cycle} className="bar-col">
                    <div className="bar-value">¥{m.total_amount >= 10000 ? (m.total_amount / 10000).toFixed(1) + '万' : m.total_amount.toFixed(0)}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${pct}%` }}></div>
                    </div>
                    <div className="bar-label">{month}月</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 各账号年度消费*/}
      {yearlyData.yearly_bills.length > 0 && (
        <div className="section-block">
          <h3>{yearlyYear}年各账号消费</h3>
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleYearlySort('account_name')}>账号名称{sortArrowFor(yearlySort, 'account_name')}</th>
                  <th className="sortable" onClick={() => handleYearlySort('yearly_amount')}>年消费总额{sortArrowFor(yearlySort, 'yearly_amount')}</th>
                  <th className="sortable" onClick={() => handleYearlySort('months_count')}>账单月数{sortArrowFor(yearlySort, 'months_count')}</th>
                </tr>
              </thead>
              <tbody>
                {getSorted(yearlyData.yearly_bills, yearlySort).map(bill => (
                  <tr key={bill.account_id}>
                    <td>{bill.account_name}</td>
                    <td className="td-amount">¥{fmtMoney(bill.yearly_amount)}</td>
                    <td className="td-center">{bill.months_count}个月</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

// ==================== 账号管理页面 ====================
function AccountManagement() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncingIds, setSyncingIds] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [formData, setFormData] = useState({ name: '', access_key_id: '', access_key_secret: '', remark: '' })
  // 自动同步配置
  const [autoSync, setAutoSync] = useState({ enabled: false, interval_hours: 6, last_sync_at: null })
  const [intervalDropdownOpen, setIntervalDropdownOpen] = useState(false)
  const intervalDropdownRef = useRef(null)
  // 顶部同步下拉菜单
  const [showTopDropdown, setShowTopDropdown] = useState(false)
  // 确认弹框
  const [confirmState, setConfirmState] = useState(null)
  const showConfirm = (msg) => new Promise(resolve => setConfirmState({ msg, onConfirm: () => { setConfirmState(null); resolve(true) }, onCancel: () => { setConfirmState(null); resolve(false) } }))

  useEffect(() => {
    if (!showTopDropdown) return
    const handleClickOutside = (e) => {
      if (e.target.closest('.top-sync-dropdown-wrap') === null) {
        setShowTopDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTopDropdown])

  useEffect(() => {
    if (!intervalDropdownOpen) return
    const handleClickOutside = (e) => {
      if (intervalDropdownRef.current && !intervalDropdownRef.current.contains(e.target)) {
        setIntervalDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [intervalDropdownOpen])

  const loadAccounts = useCallback(() => {
    setLoading(true)
    axios.get('/api/accounts')
      .then(res => setAccounts(res.data))
      .catch(err => console.error('加载账号失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const loadAutoSync = useCallback(() => {
    axios.get('/api/auto-sync')
      .then(res => setAutoSync(res.data))
      .catch(err => console.error('加载自动同步配置失败:', err))
  }, [])

  useEffect(() => { loadAutoSync() }, [loadAutoSync])

  const handleAddAccount = () => {
    setFormData({ name: '', access_key_id: '', access_key_secret: '', remark: '' })
    setEditingAccount(null)
    setShowForm(true)
  }

  const handleEditAccount = (account) => {
    setFormData({ name: account.name, access_key_id: account.access_key_id, access_key_secret: '', remark: account.remark || '' })
    setEditingAccount(account)
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!formData.name || !formData.access_key_id) {
      toast.warning('请填写账号名称和AccessKey ID')
      return
    }
    if (!editingAccount && !formData.access_key_secret) {
      toast.warning('请填写AccessKey Secret')
      return
    }

    if (editingAccount) {
      axios.put(`/api/accounts/${editingAccount.id}`, formData)
        .then(() => {
          toast.success('账号更新成功')
          setShowForm(false)
          loadAccounts()
        })
        .catch(err => toast.error('更新失败: ' + (err.response?.data?.error || err.message)))
    } else {
      axios.post('/api/accounts', formData)
        .then(() => {
          toast.success('账号添加成功')
          setShowForm(false)
          loadAccounts()
        })
        .catch(err => toast.error('添加失败: ' + (err.response?.data?.error || err.message)))
    }
  }

  const handleDelete = async (account) => {
    const ok = await showConfirm(`确定要删除账号"${account.name}"吗？该账号下的所有资源数据也将被删除！`)
    if (!ok) return
    axios.delete(`/api/accounts/${account.id}`)
      .then(() => {
        toast.success('账号已删除')
        loadAccounts()
      })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }

  // 轮询同步任务状态（最多重试 150 次 = 5 分钟超时）
  const MAX_POLL_RETRIES = 150
  const pollSyncTask = (taskId, onSuccess) => {
    let retries = 0
    const poll = () => {
      retries++
      if (retries > MAX_POLL_RETRIES) {
        toast.warning('同步超时，任务仍在后台运行，请稍后手动刷新查看', 5000)
        onSuccess(null)
        return
      }
      axios.get(`/api/sync-status/${taskId}`)
        .then(res => {
          const task = res.data
          if (task.status === 'completed') {
            onSuccess(task.result)
          } else if (task.status === 'failed') {
            toast.error('同步失败: ' + (task.error || '未知错误'))
            onSuccess(null)
          } else {
            setTimeout(poll, 2000)
          }
        })
        .catch(() => {
          setTimeout(poll, 3000)
        })
    }
    poll()
  }

  const handleSync = (accountId, syncType = 'all') => {
    const typeLabel = { all: '全部', resources: '资源', bills: '账单' }[syncType]
    setSyncingIds(prev => ({ ...prev, [accountId]: true }))
    toast.info(`正在同步${typeLabel}...`)
    axios.post(`/api/accounts/${accountId}/sync`, { sync_type: syncType })
      .then(res => {
        if (res.data.task_id) {
          pollSyncTask(res.data.task_id, (result) => {
            if (result) {
              toast.success(result.message || '同步完成')
              loadAccounts()
            }
            setSyncingIds(prev => ({ ...prev, [accountId]: false }))
          })
        } else {
          toast.success(res.data.message || '同步完成')
          setSyncingIds(prev => ({ ...prev, [accountId]: false }))
        }
      })
      .catch(err => {
        const msg = err.response?.data?.message || err.message || '未知错误'
        toast.error(`同步${typeLabel}失败: ` + msg)
        setSyncingIds(prev => ({ ...prev, [accountId]: false }))
      })
  }

  const handleSyncAll = async (syncType = 'all') => {
    const typeLabel = { all: '全部', resources: '资源', bills: '账单' }[syncType]
    const ok = await showConfirm(`确定要同步所有账号的【${typeLabel}】吗？`)
    if (!ok) return
    setLoading(true)
    toast.info(`正在同步所有账号的${typeLabel}...`)
    axios.post('/api/accounts/sync-all', { sync_type: syncType })
      .then(res => {
        if (res.data.task_id) {
          pollSyncTask(res.data.task_id, (result) => {
            if (result && result.results) {
              const successCount = result.results.filter(r => r.success).length
              const failCount = result.results.length - successCount
              if (failCount === 0) {
                toast.success(`全部同步完成，共 ${successCount} 个账号`)
              } else {
                toast.warning(`同步完成，${successCount} 成功，${failCount} 失败`, 5000)
              }
            } else {
              toast.success(res.data.message || '同步完成')
            }
            loadAccounts()
            setLoading(false)
          })
        } else {
          toast.warning(res.data.message || '没有需要同步的账号')
          setLoading(false)
        }
      })
      .catch(err => {
        const msg = err.response?.data?.message || err.message || '未知错误'
        toast.error('同步失败: ' + msg)
        setLoading(false)
      })
  }

  const handleAutoSyncToggle = () => {
    const newEnabled = !autoSync.enabled
    axios.put('/api/auto-sync', { enabled: newEnabled, interval_hours: autoSync.interval_hours })
      .then(res => {
        setAutoSync(prev => ({ ...prev, enabled: newEnabled }))
        toast.success(res.data.message)
      })
      .catch(err => toast.error('设置失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleAutoSyncInterval = (hours) => {
    axios.put('/api/auto-sync', { enabled: autoSync.enabled, interval_hours: hours })
      .then(res => {
        setAutoSync(prev => ({ ...prev, interval_hours: hours }))
        toast.success(res.data.message)
      })
      .catch(err => toast.error('设置失败: ' + (err.response?.data?.error || err.message)))
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>账号管理</h2>
        <div className="header-actions">
          <div className="top-sync-dropdown-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
            <button className="btn-primary" onClick={() => handleSyncAll('all')} disabled={loading}>
              {loading ? '同步中..' : '同步全部'}
            </button>
            <button className="btn-primary btn-dropdown-toggle" disabled={loading} onClick={() => setShowTopDropdown(!showTopDropdown)}>▾</button>
            {showTopDropdown && (
              <div className="top-sync-dropdown">
                <div onClick={() => { setShowTopDropdown(false); handleSyncAll('all') }}>同步全部</div>
                <div onClick={() => { setShowTopDropdown(false); handleSyncAll('resources') }}>仅同步资源</div>
                <div onClick={() => { setShowTopDropdown(false); handleSyncAll('bills') }}>仅同步账单（当月）</div>
              </div>
            )}
          </div>
          <button className="btn-success" onClick={handleAddAccount}>添加账号</button>
        </div>
      </div>

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="section-block form-section">
          <h3>{editingAccount ? '编辑账号' : '添加账号'}</h3>
          <div className="form-grid">
            <div className="form-item">
              <label>账号名称 <span className="required">*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="请输入账号名称" />
            </div>
            <div className="form-item">
              <label>AccessKey ID <span className="required">*</span></label>
              <input type="text" value={formData.access_key_id} onChange={e => setFormData(prev => ({ ...prev, access_key_id: e.target.value }))} placeholder="LTAI..." />
            </div>
            <div className="form-item">
              <label>AccessKey Secret {!editingAccount && <span className="required">*</span>}</label>
              <input type="password" value={formData.access_key_secret} onChange={e => setFormData(prev => ({ ...prev, access_key_secret: e.target.value }))} placeholder={editingAccount ? '不修改请留空' : '请输入ccessKey Secret'} />
            </div>
            <div className="form-item">
              <label>备注</label>
              <input type="text" value={formData.remark} onChange={e => setFormData(prev => ({ ...prev, remark: e.target.value }))} placeholder="备注信息" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleSubmit}>确定</button>
            <button className="btn-default" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 自动同步配置 */}
      <div className="section-block auto-sync-section">
        <h3>自动同步</h3>
        <div className="auto-sync-content">
          <div className="auto-sync-status">
            <span className={`status-tag ${autoSync.enabled ? 'status-active' : 'status-inactive'}`}>
              {autoSync.enabled ? '已启用' : '已禁用'}
            </span>
            <button
              className={`btn-${autoSync.enabled ? 'default' : 'success'}`}
              onClick={handleAutoSyncToggle}
            >
              {autoSync.enabled ? '禁用自动同步' : '启用自动同步'}
            </button>
          </div>
          <div className="auto-sync-interval">
            <label>同步间隔：</label>
            <div className="custom-dropdown" ref={intervalDropdownRef}>
              <button
                type="button"
                className={`custom-dropdown-trigger ${!autoSync.enabled ? 'custom-dropdown-disabled' : ''}`}
                onClick={() => autoSync.enabled && setIntervalDropdownOpen(!intervalDropdownOpen)}
              >
                {autoSync.interval_hours}小时
                <span className="custom-dropdown-arrow">▾</span>
              </button>
              {intervalDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {[1, 2, 4, 6, 12, 24].map(h => (
                    <div
                      key={h}
                      className={`custom-dropdown-item ${autoSync.interval_hours === h ? 'active' : ''}`}
                      onClick={() => { handleAutoSyncInterval(h); setIntervalDropdownOpen(false) }}
                    >
                      每{h}小时
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {autoSync.last_sync_at && (
            <div className="auto-sync-last">
              上次自动同步：{autoSync.last_sync_at}
            </div>
          )}
        </div>
      </div>

      {/* 账号列表 */}
      <div className="section-block">
        {accounts.length === 0 ? (
          <div className="empty-state">暂无账号，请点击"添加账号"添加阿里云AccessKey</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>账号名称</th>
                  <th>阿里云账号ID</th>
                  <th>AccessKey ID</th>
                  <th>备注</th>
                  <th>上次同步</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acct => (
                  <tr key={acct.id}>
                    <td>{acct.name}</td>
                    <td className="td-mono">{acct.aliyun_account_id || '-'}</td>
                    <td className="td-mono">{acct.access_key_id}</td>
                    <td>{acct.remark || '-'}</td>
                    <td>{acct.last_sync_at || '从未同步'}</td>
                    <td className="td-actions">
                      <div className="btn-group btn-group-sm">
                        <button className="btn-link" onClick={() => handleSync(acct.id, 'all')} disabled={syncingIds[acct.id]}>
                          {syncingIds[acct.id] ? '同步中..' : '同步'}
                        </button>
                        <button className="btn-link btn-dropdown-toggle-sm" disabled={syncingIds[acct.id]}>▾</button>
                        <div className="btn-dropdown-menu">
                          <div onClick={() => handleSync(acct.id, 'all')}>同步全部</div>
                          <div onClick={() => handleSync(acct.id, 'resources')}>仅同步资源</div>
                          <div onClick={() => handleSync(acct.id, 'bills')}>仅同步账单</div>
                        </div>
                      </div>
                      <button className="btn-link" onClick={() => handleEditAccount(acct)}>编辑</button>
                      <button className="btn-link btn-danger-link" onClick={() => handleDelete(acct)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmState && (
        <ConfirmModal
          message={confirmState.msg}
          onConfirm={confirmState.onConfirm}
          onCancel={confirmState.onCancel}
        />
      )}
    </div>
  )
}

// ==================== RAM 管理页面 ====================
function RamManagement() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [ramUsers, setRamUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUser, setNewUser] = useState({ user_name: '', display_name: '', comments: '' })
  // 权限管理
  const [selectedUser, setSelectedUser] = useState(null)
  const [userPolicies, setUserPolicies] = useState([])
  const [allPolicies, setAllPolicies] = useState([])
  const [showAttachForm, setShowAttachForm] = useState(false)
  const [selectedPolicy, setSelectedPolicy] = useState('')
  const [policyType, setPolicyType] = useState('System')
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policyKeyword, setPolicyKeyword] = useState('')
  const [showPolicyDropdown, setShowPolicyDropdown] = useState(false)
  // 重置密码
  const [resetPwdUser, setResetPwdUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetPwdLoading, setResetPwdLoading] = useState(false)
  // 用户搜索
  const [userKeyword, setUserKeyword] = useState('')
  // 当前操作的用户所属账号
  const [currentUserAccountId, setCurrentUserAccountId] = useState(null)
  // 确认弹框
  const [confirmState, setConfirmState] = useState(null)
  const showConfirm = (msg) => new Promise(resolve => setConfirmState({ msg, onConfirm: () => { setConfirmState(null); resolve(true) }, onCancel: () => { setConfirmState(null); resolve(false) } }))

  const filteredUsers = ramUsers.filter(u => {
    if (!userKeyword.trim()) return true
    const kw = userKeyword.trim().toLowerCase()
    return (u.user_name || '').toLowerCase().includes(kw)
      || (u.display_name || '').toLowerCase().includes(kw)
      || (u.comments || '').toLowerCase().includes(kw)
      || (u.access_keys || []).some(ak => ak.toLowerCase().includes(kw))
  })

  useEffect(() => {
    axios.get('/api/accounts')
      .then(res => {
        setAccounts(res.data)
        if (res.data.length > 0 && !selectedAccount) {
          setSelectedAccount(res.data[0].id)
        }
      })
      .catch(err => console.error('加载账号失败:', err))
  }, [])

  const loadRamUsers = useCallback(() => {
    if (!selectedAccount) return
    setLoading(true)
    
    if (selectedAccount === 'all') {
      // 全部账号：并行请求所有账号的用户数据
      Promise.all(accounts.map(acct =>
        axios.get(`/api/accounts/${acct.id}/ram/users`)
          .then(res => ({
            account_name: acct.name,
            account_id: acct.id,
            users: res.data.success ? res.data.users : []
          }))
          .catch(() => ({ account_name: acct.name, account_id: acct.id, users: [] }))
      ))
        .then(results => {
          const allUsers = results.flatMap(r =>
            r.users.map(u => ({ ...u, account_name: r.account_name, account_id: r.account_id }))
          )
          setRamUsers(allUsers)
        })
        .catch(err => toast.error('加载 RAM 用户失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    } else {
      axios.get(`/api/accounts/${selectedAccount}/ram/users`)
        .then(res => {
          if (res.data.success) setRamUsers(res.data.users)
          else toast.error(res.data.error || '加载失败')
        })
        .catch(err => toast.error('加载 RAM 用户失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    }
  }, [selectedAccount, accounts])

  useEffect(() => { if (selectedAccount) loadRamUsers() }, [selectedAccount, loadRamUsers])

  const handleCreateUser = () => {
    if (!newUser.user_name.trim()) {
      toast.warning('请填写用户名')
      return
    }
    axios.post(`/api/accounts/${selectedAccount}/ram/users`, newUser)
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          setShowCreateForm(false)
          setNewUser({ user_name: '', display_name: '', comments: '' })
          loadRamUsers()
        } else {
          toast.error(res.data.error || '创建失败')
        }
      })
      .catch(err => toast.error('创建失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleDeleteUser = async (userName, accountId) => {
    const acctId = accountId || selectedAccount
    const ok = await showConfirm(`确定要删除 RAM 用户 "${userName}" 吗？此操作不可撤销！`)
    if (!ok) return
    axios.delete(`/api/accounts/${acctId}/ram/users/${userName}`)
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          if (selectedUser === userName) setSelectedUser(null)
          loadRamUsers()
        } else {
          toast.error(res.data.error || '删除失败')
        }
      })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }

  const loadUserPolicies = (userName, accountId) => {
    const acctId = accountId || selectedAccount
    setPolicyLoading(true)
    axios.get(`/api/accounts/${acctId}/ram/users/${userName}/policies`)
      .then(res => {
        if (res.data.success) setUserPolicies(res.data.policies)
        else toast.error(res.data.error || '加载权限失败')
      })
      .catch(err => toast.error('加载权限失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setPolicyLoading(false))
  }

  const loadAllPolicies = () => {
    const acctId = currentUserAccountId || selectedAccount
    axios.get(`/api/accounts/${acctId}/ram/policies`, { params: { policy_type: policyType } })
      .then(res => {
        if (res.data.success) setAllPolicies(res.data.policies)
        else toast.error(res.data.error || '加载策略列表失败')
      })
      .catch(err => toast.error('加载策略列表失败: ' + (err.response?.data?.error || err.message)))
  }

  // 根据搜索关键词过滤策略列表
  const filteredPolicies = policyKeyword.trim()
    ? allPolicies.filter(p =>
        p.policy_name.toLowerCase().includes(policyKeyword.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(policyKeyword.toLowerCase()))
      )
    : allPolicies

  const handleSelectUser = (userName, accountId) => {
    if (selectedUser === userName) {
      setSelectedUser(null)
      setUserPolicies([])
      setCurrentUserAccountId(null)
    } else {
      setSelectedUser(userName)
      setCurrentUserAccountId(accountId || null)
      loadUserPolicies(userName, accountId)
    }
  }

  const handleAttachPolicy = () => {
    if (!selectedPolicy) {
      toast.warning('请选择策略')
      return
    }
    const acctId = currentUserAccountId || selectedAccount
    axios.post(`/api/accounts/${acctId}/ram/users/${selectedUser}/policies`, {
      policy_name: selectedPolicy,
      policy_type: policyType
    })
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          setShowAttachForm(false)
          setSelectedPolicy('')
          loadUserPolicies(selectedUser, currentUserAccountId)
        } else {
          toast.error(res.data.error || '添加权限失败')
        }
      })
      .catch(err => toast.error('添加权限失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleDetachPolicy = async (policyName, pType) => {
    const ok = await showConfirm(`确定要移除策略"${policyName}" 吗？`)
    if (!ok) return
    const acctId = currentUserAccountId || selectedAccount
    axios.delete(`/api/accounts/${acctId}/ram/users/${selectedUser}/policies/${policyName}`, {
      params: { policy_type: pType }
    })
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          loadUserPolicies(selectedUser)
        } else {
          toast.error(res.data.error || '移除权限失败')
        }
      })
      .catch(err => toast.error('移除权限失败: ' + (err.response?.data?.error || err.message)))
  }

  // 生成随机密码（16位，包含大小写字母、数字、符号）
  const generatePassword = () => {
    const lower = 'abcdefghijklmnopqrstuvwxyz'
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'
    const symbols = '!@#$%^&*()-_=+'
    const all = lower + upper + digits + symbols
    // 确保每类至少一个
    const pick = (s) => s[Math.floor(Math.random() * s.length)]
    const pwd = [
      pick(lower), pick(upper), pick(digits), pick(symbols),
      ...Array.from({ length: 12 }, () => pick(all))
    ]
    // 打乱顺序
    for (let i = pwd.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pwd[i], pwd[j]] = [pwd[j], pwd[i]]
    }
    setNewPassword(pwd.join(''))
  }

  const handleResetPassword = () => {
    if (!newPassword.trim()) {
      toast.warning('请输入新密码')
      return
    }
    if (newPassword.length < 8) {
      toast.warning('密码长度至少 8 位')
      return
    }
    setResetPwdLoading(true)
    const acctId = resetPwdUser.account_id || selectedAccount
    axios.post(`/api/accounts/${acctId}/ram/users/${resetPwdUser.user_name}/password`, { password: newPassword })
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          setResetPwdUser(null)
          setNewPassword('')
        } else {
          toast.error(res.data.error || '重置密码失败')
        }
      })
      .catch(err => toast.error('重置密码失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setResetPwdLoading(false))
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>RAM 用户管理</h2>
        <div className="header-actions">
          <button className="btn-success" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? '取消' : '创建用户'}
          </button>
        </div>
      </div>

      {/* 搜索框*/}
      <div className="search-bar">
        <select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); setSelectedUser(null) }}>
          <option value="all">全部账号</option>
          {accounts.map(acct => (
            <option key={acct.id} value={acct.id}>{acct.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="搜索登录名、显示名、AccessKey ID..."
          value={userKeyword}
          onChange={e => setUserKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadRamUsers()}
        />
        <button className="btn-primary" onClick={loadRamUsers} disabled={loading}>
          {loading ? '查询中..' : '搜索'}
        </button>
        <button className="btn-default" onClick={() => { setSelectedAccount('all'); setUserKeyword(''); setSelectedUser(null); setUserPolicies([]) }}>重置</button>
      </div>

      {/* 创建用户表单 */}
      {showCreateForm && (
        <div className="section-block form-section">
          <h3>创建 RAM 用户</h3>
          <div className="form-grid">
            <div className="form-item">
              <label>用户名<span className="required">*</span></label>
              <input type="text" value={newUser.user_name} onChange={e => setNewUser(prev => ({ ...prev, user_name: e.target.value }))} placeholder="请输入用户名" />
            </div>
            <div className="form-item">
              <label>显示名称</label>
              <input type="text" value={newUser.display_name} onChange={e => setNewUser(prev => ({ ...prev, display_name: e.target.value }))} placeholder="显示名称（可选）" />
            </div>
            <div className="form-item">
              <label>备注</label>
              <input type="text" value={newUser.comments} onChange={e => setNewUser(prev => ({ ...prev, comments: e.target.value }))} placeholder="备注信息（可选）" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreateUser}>确认创建</button>
            <button className="btn-default" onClick={() => { setShowCreateForm(false); setNewUser({ user_name: '', display_name: '', comments: '' }) }}>取消</button>
          </div>
        </div>
      )}

      {/* RAM 用户列表 */}
      <div className="section-block">
        <h3 style={{ marginBottom: 12 }}>用户列表（{ramUsers.length} 个）</h3>
        {ramUsers.length === 0 ? (
          <div className="empty-state">暂无 RAM 用户，点击"创建用户"添加</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">未找到匹配"${userKeyword}”的用户</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {selectedAccount === 'all' && <th>所属账号</th>}
                  <th>用户名</th>
                  <th>显示名称</th>
                  <th>登录名称</th>
                  <th>AccessKey ID</th>
                  <th>创建时间</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <Fragment key={`${user.account_id || ''}-${user.user_name}`}>
                    <tr>
                      {selectedAccount === 'all' && <td>{user.account_name}</td>}
                      <td>{user.user_name}</td>
                      <td>{user.display_name || '-'}</td>
                      <td className="td-mono">{user.user_principal_name || user.user_name}</td>
                      <td className="td-mono">
                        {user.access_keys && user.access_keys.length > 0
                          ? user.access_keys.join(', ')
                          : '-'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(user.create_date)}</td>
                      <td>{user.comments || '-'}</td>
                      <td className="td-actions">
                        <button className="btn-link" onClick={() => handleSelectUser(user.user_name, user.account_id)}>
                          {selectedUser === user.user_name ? '收起权限' : '查看权限'}
                        </button>
                        <button className="btn-link" onClick={() => { setResetPwdUser({ user_name: user.user_name, account_id: user.account_id }); generatePassword() }}>重置密码</button>
                        <button className="btn-link btn-danger-link" onClick={() => handleDeleteUser(user.user_name, user.account_id)}>删除</button>
                      </td>
                    </tr>
                    {selectedUser === user.user_name && (
                      <tr key={`policies-${user.account_id || ''}-${user.user_name}`}>
                        <td colSpan={selectedAccount === 'all' ? 8 : 7} style={{ padding: 0 }}>
                          <div className="ram-policy-panel">
                            <div className="ram-policy-header">
                              <strong>权限策略</strong>
                              <button className="btn-primary btn-sm" onClick={() => { setShowAttachForm(true); loadAllPolicies() }}>
                                添加策略
                              </button>
                            </div>
                            {policyLoading ? (
                              <div className="empty-state">加载中..</div>
                            ) : userPolicies.length === 0 ? (
                              <div className="empty-state">暂无权限策略</div>
                            ) : (
                              <table className="data-table inner-table">
                                <thead>
                                  <tr>
                                    <th>策略名称</th>
                                    <th>策略类型</th>
                                    <th>操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {userPolicies.map(p => (
                                    <tr key={`${p.policy_type}-${p.policy_name}`}>
                                      <td>{p.policy_name}</td>
                                      <td><span className={`status-tag ${p.policy_type === 'System' ? 'status-active' : 'status-Creating'}`}>{p.policy_type}</span></td>
                                      <td>
                                        <button className="btn-link btn-danger-link" onClick={() => handleDetachPolicy(p.policy_name, p.policy_type)}>移除</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {/* 添加策略表单 */}
                            {showAttachForm && (
                              <div className="ram-attach-form">
                                <div className="ram-attach-row">
                                  <label>策略类型：</label>
                                  <select value={policyType} onChange={e => { setPolicyType(e.target.value); setPolicyKeyword(''); loadAllPolicies() }}>
                                    <option value="System">系统策略</option>
                                    <option value="Custom">自定义策略</option>
                                  </select>
                                </div>
                                <div className="ram-attach-row" style={{ marginTop: 12 }}>
                                  <label>搜索策略：</label>
                                  <input
                                    type="text"
                                    className="ram-policy-search-input"
                                    placeholder="输入关键字搜索，如 rds、ecs、oss..."
                                    value={policyKeyword}
                                    onChange={e => { setPolicyKeyword(e.target.value); setShowPolicyDropdown(true) }}
                                    onFocus={() => setShowPolicyDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowPolicyDropdown(false), 200)}
                                  />
                                </div>
                                {showPolicyDropdown && (
                                  <div className="ram-policy-dropdown">
                                    {policyKeyword.trim() && (
                                      <div className="ram-policy-dropdown-hint">找到 {filteredPolicies.length} 个匹配策略</div>
                                    )}
                                    {filteredPolicies.length === 0 ? (
                                      <div className="ram-policy-dropdown-empty">无匹配策略</div>
                                    ) : (
                                      filteredPolicies.map(p => (
                                        <div
                                          key={p.policy_name}
                                          className={`ram-policy-option ${selectedPolicy === p.policy_name ? 'selected' : ''}`}
                                          onMouseDown={() => {
                                            setSelectedPolicy(p.policy_name)
                                            setShowPolicyDropdown(false)
                                          }}
                                        >
                                          <div className="ram-policy-option-name">{p.policy_name}</div>
                                          {p.description && <div className="ram-policy-option-desc">{p.description}</div>}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                                {selectedPolicy && (
                                  <div className="ram-selected-policy">
                                    已选择：<strong>{selectedPolicy}</strong>
                                    {(() => { const p = allPolicies.find(x => x.policy_name === selectedPolicy); return p?.description ? ` — ${p.description}` : '' })()}
                                  </div>
                                )}
                                <div className="ram-attach-row" style={{ marginTop: 12 }}>
                                  <button className="btn-primary btn-sm" onClick={handleAttachPolicy} disabled={!selectedPolicy}>确认添加</button>
                                  <button className="btn-default btn-sm" onClick={() => { setShowAttachForm(false); setSelectedPolicy(''); setPolicyKeyword('') }}>取消</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* 重置密码弹框 */}
      {resetPwdUser && (
        <div className="modal-overlay" onClick={() => { setResetPwdUser(null); setNewPassword('') }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">🔑</div>
            <p className="modal-msg">重置用户 <strong>{resetPwdUser.user_name}</strong> 的登录密码</p>
            <div className="form-item" style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少 8 位）"
                onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
              <button className="btn-default btn-sm" onClick={generatePassword}>
                自动生成
              </button>
              <button className="btn-default btn-sm" onClick={() => {
                if (!newPassword) return
                const textarea = document.createElement('textarea')
                textarea.value = newPassword
                textarea.style.position = 'fixed'
                textarea.style.opacity = '0'
                document.body.appendChild(textarea)
                textarea.select()
                try {
                  document.execCommand('copy')
                  toast.success('密码已复制')
                } catch (e) {
                  toast.error('复制失败，请手动复制')
                }
                document.body.removeChild(textarea)
              }} style={{ whiteSpace: 'nowrap' }} disabled={!newPassword}>
                复制
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleResetPassword} disabled={resetPwdLoading}>
                {resetPwdLoading ? '提交中..' : '确认重置'}
              </button>
              <button className="btn-default" onClick={() => { setResetPwdUser(null); setNewPassword('') }}>取消</button>
            </div>
          </div>
        </div>
      )}
      {confirmState && (
        <ConfirmModal message={confirmState.msg} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      )}
    </div>
  )
}

// ==================== 域名管理 ====================
function DnsManagement() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [domains, setDomains] = useState([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRecord, setNewRecord] = useState({ rr: '', type: 'A', value: '', ttl: 600, line: 'default' })
  const [editRecord, setEditRecord] = useState(null)
  const [domainKeyword, setDomainKeyword] = useState('')
  const [holderKeyword, setHolderKeyword] = useState('')
  const [recordKeyword, setRecordKeyword] = useState('')
  const [recordPage, setRecordPage] = useState(1)
  const [recordTotal, setRecordTotal] = useState(0)
  const RECORD_PAGE_SIZE = 20
  const [domainSort, setDomainSort] = useState({ field: 'end_time', order: 'asc' })
  // 确认弹框
  const [confirmState, setConfirmState] = useState(null)
  const showConfirm = (msg) => new Promise(resolve => setConfirmState({ msg, onConfirm: () => { setConfirmState(null); resolve(true) }, onCancel: () => { setConfirmState(null); resolve(false) } }))

  const filteredDomains = domains.filter(d => {
    const kw = domainKeyword.trim().toLowerCase()
    const hk = holderKeyword.trim().toLowerCase()
    if (kw && !(d.domain_name || '').toLowerCase().includes(kw)) return false
    if (hk && !(d.holder || '').toLowerCase().includes(hk)) return false
    return true
  })

  const sortedDomains = [...filteredDomains].sort((a, b) => {
    if (!domainSort.field) return 0
    let va = a[domainSort.field]
    let vb = b[domainSort.field]
    if (domainSort.field === 'record_count') {
      return domainSort.order === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0)
    }
    if (domainSort.field === 'end_time') {
      const toTs = (v) => {
        if (!v) return 0
        const s = String(v).trim()
        if (/^\d{10,13}$/.test(s)) return s.length === 10 ? Number(s) * 1000 : Number(s)
        const dt = new Date(s)
        return isNaN(dt.getTime()) ? 0 : dt.getTime()
      }
      const ta = toTs(va), tb = toTs(vb)
      return domainSort.order === 'asc' ? ta - tb : tb - ta
    }
    va = String(va || '').toLowerCase()
    vb = String(vb || '').toLowerCase()
    const cmp = va.localeCompare(vb)
    return domainSort.order === 'asc' ? cmp : -cmp
  })

  const toggleDomainSort = (field) => {
    setDomainSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }))
  }

  const sortIcon = (field) => {
    if (domainSort.field !== field) return ' ↕'
    return domainSort.order === 'asc' ? ' ↑' : ' ↓'
  }

  useEffect(() => {
    axios.get('/api/accounts').then(res => {
      setAccounts(res.data)
      if (res.data.length > 0 && !selectedAccount) setSelectedAccount('all')
    })
  }, [])

  useEffect(() => {
    if (!selectedAccount) return
    setLoading(true)
    setSelectedDomain('')
    setDomains([])
    setRecords([])
    
    if (selectedAccount === 'all') {
      // 全部账号：并行请求所有账号的域名
      Promise.all(accounts.map(acct =>
        axios.get(`/api/accounts/${acct.id}/dns/domains`)
          .then(res => ({
            account_name: acct.name,
            account_id: acct.id,
            domains: res.data.success ? res.data.domains : []
          }))
          .catch(() => ({ account_name: acct.name, account_id: acct.id, domains: [] }))
      ))
        .then(results => {
          const allDomains = results.flatMap(r =>
            r.domains.map(d => ({ ...d, account_name: r.account_name, account_id: r.account_id }))
          )
          setDomains(allDomains)
          if (allDomains.length > 0 && !selectedDomain) {
            setSelectedDomain(allDomains[0].domain_name)
          }
        })
        .catch(err => toast.error('加载域名失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    } else {
      axios.get(`/api/accounts/${selectedAccount}/dns/domains`)
        .then(res => {
          if (res.data.success) {
            setDomains(res.data.domains)
            if (res.data.domains.length > 0 && !selectedDomain) {
              setSelectedDomain(res.data.domains[0].domain_name)
            }
          } else toast.error(res.data.error || '加载域名失败')
        })
        .catch(err => toast.error('加载域名失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    }
  }, [selectedAccount, accounts])

  // 获取当前选中域名的账号ID
  const getDomainAccountId = () => {
    if (!selectedDomain) return selectedAccount
    const domain = domains.find(d => d.domain_name === selectedDomain)
    return domain?.account_id || selectedAccount
  }

  const loadRecords = useCallback((page) => {
    if (!selectedDomain) return
    const p = page || recordPage
    setLoading(true)
    const acctId = getDomainAccountId()
    const params = new URLSearchParams()
    params.set('page_number', p)
    params.set('page_size', RECORD_PAGE_SIZE)
    if (recordKeyword.trim()) params.set('keyword', recordKeyword.trim())
    axios.get(`/api/accounts/${acctId}/dns/domains/${selectedDomain}/records?${params.toString()}`)
      .then(res => {
        if (res.data.success) {
          setRecords(res.data.records)
          setRecordTotal(res.data.total || 0)
          setRecordPage(res.data.page_number || p)
        } else toast.error(res.data.error || '加载解析记录失败')
      })
      .catch(err => toast.error('加载解析记录失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setLoading(false))
  }, [selectedAccount, selectedDomain, domains, recordKeyword, recordPage])

  const recordTotalPages = Math.max(1, Math.ceil(recordTotal / RECORD_PAGE_SIZE))

  useEffect(() => {
    if (selectedDomain) {
      setRecordKeyword('')
      setRecordPage(1)
      loadRecords(1)
    }
  }, [selectedDomain])

  const handleAddRecord = () => {
    if (!newRecord.rr.trim()) { toast.warning('请输入主机记录'); return }
    if (!newRecord.value.trim()) { toast.warning('请输入记录值'); return }
    const acctId = getDomainAccountId()
    axios.post(`/api/accounts/${acctId}/dns/domains/${selectedDomain}/records`, newRecord)
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          setShowAddForm(false)
          setNewRecord({ rr: '', type: 'A', value: '', ttl: 600, line: 'default' })
          loadRecords()
        } else toast.error(res.data.error || '添加失败')
      })
      .catch(err => toast.error('添加失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleUpdateRecord = () => {
    if (!editRecord) return
    const acctId = getDomainAccountId()
    axios.put(`/api/accounts/${acctId}/dns/records/${editRecord.record_id}`, editRecord)
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          setEditRecord(null)
          loadRecords()
        } else toast.error(res.data.error || '修改失败')
      })
      .catch(err => toast.error('修改失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleDeleteRecord = async (recordId, rr) => {
    const ok = await showConfirm(`确定删除解析记录 "${rr}.${selectedDomain}" 吗？`)
    if (!ok) return
    const acctId = getDomainAccountId()
    axios.delete(`/api/accounts/${acctId}/dns/records/${recordId}`)
      .then(res => {
        if (res.data.success) { toast.success(res.data.message); loadRecords() }
        else toast.error(res.data.error || '删除失败')
      })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleToggleStatus = (record) => {
    const newStatus = record.status === 'ENABLE' ? 'DISABLE' : 'ENABLE'
    const acctId = getDomainAccountId()
    axios.post(`/api/accounts/${acctId}/dns/records/${record.record_id}/status`, { status: newStatus })
      .then(res => {
        if (res.data.success) { toast.success(res.data.message); loadRecords() }
        else toast.error(res.data.error || '操作失败')
      })
      .catch(err => toast.error('操作失败: ' + (err.response?.data?.error || err.message)))
  }

  const RECORD_TYPES = ['A', 'CNAME', 'MX', 'TXT', 'SRV', 'AAAA', 'NS', 'CAA']
  const LINES = [
    { value: 'default', label: '默认' },
    { value: 'telecom', label: '电信' },
    { value: 'unicom', label: '联通' },
    { value: 'mobile', label: '移动' },
    { value: 'oversea', label: '境外' },
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>域名管理</h2>
      </div>

      {/* 域名选择 */}
      <div className="section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>域名列表（{domains.length}个）{filteredDomains.length !== domains.length ? ` 筛选中：${filteredDomains.length} 条` : ''}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={selectedAccount}
              onChange={e => { setSelectedAccount(e.target.value); setSelectedDomain(''); setDomains([]); setRecords([]) }}
              style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'rgba(255,255,255,0.9)', boxSizing: 'border-box' }}
            >
              <option value="all">全部账号</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input
              type="text"
              placeholder="搜索域名..."
              value={domainKeyword}
              onChange={e => setDomainKeyword(e.target.value)}
              style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 180, boxSizing: 'border-box' }}
            />
            <input
              type="text"
              placeholder="搜索持有者..."
              value={holderKeyword}
              onChange={e => setHolderKeyword(e.target.value)}
              style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 180, boxSizing: 'border-box' }}
            />
            <button className="btn-primary" onClick={() => {}}>搜索</button>
            <button className="btn-default" onClick={() => { setSelectedAccount('all'); setDomainKeyword(''); setHolderKeyword(''); setSelectedDomain(''); setDomains([]); setRecords([]) }}>重置</button>
          </div>
        </div>
        {domains.length === 0 ? (
          <div className="empty-state">{loading ? '加载中..' : '无域名'}</div>
        ) : filteredDomains.length === 0 ? (
          <div className="empty-state">未找到匹配"{domainKeyword}"的域名</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {selectedAccount === 'all' && <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleDomainSort('account_name')}>账号{sortIcon('account_name')}</th>}
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleDomainSort('domain_name')}>域名{sortIcon('domain_name')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleDomainSort('holder')}>持有者{sortIcon('holder')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleDomainSort('record_count')}>记录数{sortIcon('record_count')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleDomainSort('end_time')}>到期时间{sortIcon('end_time')}</th>
                  <th style={{ width: 70 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedDomains.map(d => (
                  <tr key={`${d.account_id || ''}-${d.domain_name}`}
                    style={{ cursor: 'pointer', background: selectedDomain === d.domain_name ? '#eef2ff' : 'transparent' }}
                    onClick={() => setSelectedDomain(d.domain_name)}>
                    {selectedAccount === 'all' && <td style={{ color: '#666' }}>{d.account_name}</td>}
                    <td>{d.domain_name}</td>
                    <td style={{ color: '#555' }}>{d.holder || '-'}</td>
                    <td>{d.record_count}</td>
                    <td className="td-mono" style={{ color: d.end_time && (() => { const s=String(d.end_time).trim(); const ts=/^\d{10,13}$/.test(s)?(s.length===10?Number(s)*1000:Number(s)):new Date(s).getTime(); return !isNaN(ts)&&ts<Date.now() })() ? '#ef4444' : '#333' }}>
                      {d.end_time ? (() => { const s=String(d.end_time).trim(); const ts=/^\d{10,13}$/.test(s)?(s.length===10?Number(s)*1000:Number(s)):new Date(s).getTime(); return isNaN(ts)?s:new Date(ts).toLocaleDateString() })() : '-'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <button className="btn-link" onClick={(e) => { e.stopPropagation(); setSelectedDomain(d.domain_name); setTimeout(() => document.getElementById('dns-records-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }}>
                        解析
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 解析记录 */}
      {selectedDomain && (
        <div className="section-block" id="dns-records-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{selectedDomain} 解析记录（{recordTotal} 条）</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="search-bar-input"
                placeholder="搜索记录值/主机记录.."
                value={recordKeyword}
                onChange={e => setRecordKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setRecordPage(1); loadRecords(1) } }}
                style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 220, boxSizing: 'border-box' }}
              />
              <button className="btn-primary" onClick={() => { setRecordPage(1); loadRecords(1) }}>搜索</button>
              <button className="btn-default" onClick={() => { setRecordKeyword(''); setRecordPage(1); setTimeout(() => loadRecords(1), 0) }}>重置</button>
              <button className="btn-success" onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? '取消' : '添加记录'}
              </button>
            </div>
          </div>

          {/* 添加记录表单 */}
          {showAddForm && (
            <div className="dns-form-card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 100px 120px', gap: 10, alignItems: 'end' }}>
                <div className="form-item" style={{ margin: 0 }}>
                  <label>主机记录</label>
                  <input type="text" value={newRecord.rr} onChange={e => setNewRecord({ ...newRecord, rr: e.target.value })} placeholder="如 www、@、*" />
                </div>
                <div className="form-item" style={{ margin: 0 }}>
                  <label>记录类型</label>
                  <select value={newRecord.type} onChange={e => setNewRecord({ ...newRecord, type: e.target.value })}>
                    {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-item" style={{ margin: 0 }}>
                  <label>记录值</label>
                  <input type="text" value={newRecord.value} onChange={e => setNewRecord({ ...newRecord, value: e.target.value })} placeholder="IP 地址或域名" />
                </div>
                <div className="form-item" style={{ margin: 0 }}>
                  <label>TTL</label>
                  <select value={newRecord.ttl} onChange={e => setNewRecord({ ...newRecord, ttl: Number(e.target.value) })}>
                    <option value={600}>10分钟</option>
                    <option value={1800}>30分钟</option>
                    <option value={3600}>1小时</option>
                    <option value={86400}>1天</option>
                  </select>
                </div>
                <div className="form-item" style={{ margin: 0 }}>
                  <label>线路</label>
                  <select value={newRecord.line} onChange={e => setNewRecord({ ...newRecord, line: e.target.value })}>
                    {LINES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn-primary" onClick={handleAddRecord}>确认添加</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="empty-state">加载中..</div>
          ) : records.length === 0 ? (
            <div className="empty-state">暂无解析记录</div>
          ) : (
            <div className="overview-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>主机记录</th>
                    <th>类型</th>
                    <th>线路</th>
                    <th>记录值</th>
                    <th>TTL</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.record_id}>
                      <td className="td-bold">{r.rr}</td>
                      <td><span className="dns-type-tag">{r.type}</span></td>
                      <td>{LINES.find(l => l.value === r.line)?.label || r.line}</td>
                      <td className="td-mono" style={{ fontSize: 13 }}>{r.value}</td>
                      <td>{r.ttl}s</td>
                      <td>
                        <span className={`dns-status ${r.status === 'ENABLE' ? 'enabled' : 'disabled'}`}>
                          {r.status === 'ENABLE' ? '启用' : '暂停'}
                        </span>
                      </td>
                      <td className="td-actions">
                        <button className="btn-link" onClick={() => setEditRecord({ ...r })}>编辑</button>
                        <button className="btn-link" onClick={() => handleToggleStatus(r)}>
                          {r.status === 'ENABLE' ? '暂停' : '启用'}
                        </button>
                        <button className="btn-link btn-danger-link" onClick={() => handleDeleteRecord(r.record_id, r.rr)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {recordTotal > RECORD_PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                className="btn-default btn-sm"
                disabled={recordPage <= 1}
                onClick={() => { setRecordPage(recordPage - 1); loadRecords(recordPage - 1) }}
              >
                上一页
              </button>
              <span style={{ fontSize: 14, color: '#64748b' }}>
                第 {recordPage} / {recordTotalPages} 页，共 {recordTotal} 条
              </span>
              <button
                className="btn-default btn-sm"
                disabled={recordPage >= recordTotalPages}
                onClick={() => { setRecordPage(recordPage + 1); loadRecords(recordPage + 1) }}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 编辑记录弹框 */}
      {editRecord && (
        <div className="modal-overlay" onClick={() => setEditRecord(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">鉁忥笍</div>
            <p className="modal-msg">编辑解析记录</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-item" style={{ margin: 0 }}>
                <label>主机记录</label>
                <input type="text" value={editRecord.rr} onChange={e => setEditRecord({ ...editRecord, rr: e.target.value })} />
              </div>
              <div className="form-item" style={{ margin: 0 }}>
                <label>记录类型</label>
                <select value={editRecord.type} onChange={e => setEditRecord({ ...editRecord, type: e.target.value })}>
                  {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-item" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label>记录值</label>
                <input type="text" value={editRecord.value} onChange={e => setEditRecord({ ...editRecord, value: e.target.value })} />
              </div>
              <div className="form-item" style={{ margin: 0 }}>
                <label>TTL</label>
                <select value={editRecord.ttl} onChange={e => setEditRecord({ ...editRecord, ttl: Number(e.target.value) })}>
                  <option value={600}>10分钟</option>
                  <option value={1800}>30分钟</option>
                  <option value={3600}>1小时</option>
                  <option value={86400}>1天</option>
                </select>
              </div>
              <div className="form-item" style={{ margin: 0 }}>
                <label>线路</label>
                <select value={editRecord.line} onChange={e => setEditRecord({ ...editRecord, line: e.target.value })}>
                  {LINES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleUpdateRecord}>保存</button>
              <button className="btn-default" onClick={() => setEditRecord(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {confirmState && (
        <ConfirmModal message={confirmState.msg} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      )}
    </div>
  )
}

// ==================== SSL 证书管理 ====================
function SslManagement() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState('end_date')
  const [sortDir, setSortDir] = useState('asc')
  const [certKeyword, setCertKeyword] = useState('')

  useEffect(() => {
    axios.get('/api/accounts').then(res => {
      setAccounts(res.data)
      if (res.data.length > 0 && !selectedAccount) setSelectedAccount('all')
    })
  }, [])

  const loadCerts = useCallback(() => {
    if (!selectedAccount) return
    setLoading(true)
    
    if (selectedAccount === 'all') {
      Promise.all(accounts.map(acct =>
        axios.get(`/api/accounts/${acct.id}/ssl/certificates`)
          .then(res => ({
            account_name: acct.name,
            certs: res.data.success ? res.data.certificates : []
          }))
          .catch(() => ({ account_name: acct.name, certs: [] }))
      ))
        .then(results => {
          const allCerts = results.flatMap(r =>
            r.certs.map(c => ({ ...c, account_name: r.account_name }))
          )
          setCerts(allCerts)
        })
        .catch(err => toast.error('加载证书失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    } else {
      axios.get(`/api/accounts/${selectedAccount}/ssl/certificates`)
        .then(res => {
          if (res.data.success) setCerts(res.data.certificates)
          else toast.error(res.data.error || '加载证书失败')
        })
        .catch(err => toast.error('加载证书失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    }
  }, [selectedAccount, accounts])

  useEffect(() => { if (selectedAccount) loadCerts() }, [selectedAccount, loadCerts])

  const getDaysLeft = (endDate) => {
    if (!endDate) return null
    const s = String(endDate).trim()
    let end
    if (/^\d{10,13}$/.test(s)) {
      const ts = s.length === 10 ? Number(s) * 1000 : Number(s)
      end = new Date(ts)
    } else {
      end = new Date(s)
    }
    if (isNaN(end.getTime())) return null
    const now = new Date()
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24))
  }

  const getStatusTag = (cert) => {
    const days = getDaysLeft(cert.end_date)
    if (days === null) return <span className="ssl-status unknown">未知</span>
    if (days < 0) return <span className="ssl-status expired">已过期</span>
    if (days <= 7) return <span className="ssl-status critical">即将过期（{days}天）</span>
    if (days <= 30) return <span className="ssl-status warning">剩余 {days} 天</span>
    return <span className="ssl-status ok">剩余 {days} 天</span>
  }

  const parseDate = (d) => {
    if (!d) return 0
    const s = String(d).trim()
    if (/^\d{10,13}$/.test(s)) {
      const ts = s.length === 10 ? Number(s) * 1000 : Number(s)
      return ts
    }
    const dt = new Date(s)
    return isNaN(dt.getTime()) ? 0 : dt.getTime()
  }

  // 列定义（sortable 标记可排序列）
  const sslColumns = [
    { key: 'account_name', label: '所属账号', sortable: true, showOnly: 'all' },
    { key: 'name', label: '证书名称', sortable: true },
    { key: 'domain', label: '域名', sortable: true },
    { key: 'issuer', label: '品牌', sortable: true },
    { key: 'cert_type', label: '类型', sortable: true },
    { key: 'start_date', label: '生效时间', sortable: true, dateKey: true, render: v => v ? fmtDate(v) : '-' },
    { key: 'end_date', label: '到期时间', sortable: true, dateKey: true, render: v => v ? fmtDate(v) : '-' },
    { key: 'status', label: '状态', render: (_, c) => getStatusTag(c) },
  ]

  const visibleColumns = sslColumns.filter(c => c.showOnly !== 'all' || selectedAccount === 'all')

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortArrow = (key) => {
    if (sortKey !== key) return <span className="sort-arrow"> ↕</span>
    return <span className="sort-arrow active"> {sortDir === 'asc' ? '↓' : '↑'}</span>
  }

  const sortedCerts = (() => {
    // 先按关键词过滤
    let arr = certs
    if (certKeyword.trim()) {
      const kw = certKeyword.trim().toLowerCase()
      arr = certs.filter(c =>
        (c.name || '').toLowerCase().includes(kw) ||
        (c.domain || '').toLowerCase().includes(kw) ||
        (c.issuer || '').toLowerCase().includes(kw) ||
        (c.cert_type || '').toLowerCase().includes(kw)
      )
    }
    // 再排序
    if (!sortKey) return arr
    const col = sslColumns.find(c => c.key === sortKey)
    if (!col || !col.sortable) return arr
    arr = [...arr]
    arr.sort((a, b) => {
      let va, vb
      if (col.dateKey) {
        va = parseDate(a[sortKey])
        vb = parseDate(b[sortKey])
        return sortDir === 'asc' ? va - vb : vb - va
      }
      va = a[sortKey] ?? ''
      vb = b[sortKey] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const sa = String(va), sb = String(vb)
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
    return arr
  })()

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>SSL 证书管理</h2>
      </div>

      {/* 搜索框*/}
      <div className="search-bar">
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="all">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="搜索证书名称、域名、品牌..."
          value={certKeyword}
          onChange={e => setCertKeyword(e.target.value)}
        />
        <button className="btn-primary" onClick={loadCerts} disabled={loading}>
          {loading ? '查询中..' : '搜索'}
        </button>
        <button className="btn-default" onClick={() => { setSelectedAccount('all'); setCertKeyword(''); setSortKey(''); setSortDir('asc') }}>重置</button>
      </div>

      <div className="section-block">
        <h3>证书列表（{sortedCerts.length} 个）</h3>
        {loading ? (
          <div className="empty-state">加载中..</div>
        ) : sortedCerts.length === 0 ? (
          <div className="empty-state">{certs.length === 0 ? '暂无 SSL 证书' : '无匹配结果'}</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {visibleColumns.map(col => (
                    <th
                      key={col.key}
                      className={col.sortable ? 'sortable' : ''}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    >
                      {col.label}{col.sortable && sortArrow(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCerts.map((c, idx) => (
                  <tr key={`${c.account_name || ''}-${c.id || idx}`}>
                    {visibleColumns.map(col => (
                      <td key={col.key} className={col.className || ''}>
                        {col.render ? col.render(c[col.key], c) : (c[col.key] || '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 云监控====================
function CloudMonitor() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [alarms, setAlarms] = useState([])
  const [activeAlarms, setActiveAlarms] = useState([])
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState({})
  const [monitorKeyword, setMonitorKeyword] = useState('')

  const filterByKeyword = (list) => {
    if (!monitorKeyword.trim()) return list
    const kw = monitorKeyword.trim().toLowerCase()
    return list.filter(a =>
      (a.rule_name || '').toLowerCase().includes(kw) ||
      (a.namespace || '').toLowerCase().includes(kw) ||
      (a.metric_name || '').toLowerCase().includes(kw) ||
      (a.resource || '').toLowerCase().includes(kw) ||
      (a.account_name || '').toLowerCase().includes(kw)
    )
  }

  const filteredActiveAlarms = filterByKeyword(activeAlarms)
  const filteredAlarms = filterByKeyword(alarms)

  useEffect(() => {
    axios.get('/api/accounts').then(res => {
      setAccounts(res.data)
      if (res.data.length > 0 && !selectedAccount) setSelectedAccount(res.data[0].id)
    })
  }, [])

  const loadAlarms = useCallback(() => {
    if (!selectedAccount) return
    if (selectedAccount === 'all') {
      Promise.all(accounts.map(acct =>
        axios.get(`/api/accounts/${acct.id}/monitor/alarm`)
          .then(res => ({ account_name: acct.name, alarms: res.data.success ? res.data.alarms : [] }))
          .catch(() => ({ account_name: acct.name, alarms: [] }))
      ))
        .then(results => {
          const all = results.flatMap(r => r.alarms.map(a => ({ ...a, account_name: r.account_name })))
          setAlarms(all)
        })
    } else {
      axios.get(`/api/accounts/${selectedAccount}/monitor/alarm`)
        .then(res => {
          if (res.data.success) setAlarms(res.data.alarms)
          else toast.error(res.data.error || '加载告警规则失败')
        })
        .catch(err => toast.error('加载告警规则失败: ' + (err.response?.data?.error || err.message)))
    }
  }, [selectedAccount, accounts])

  const loadActiveAlarms = useCallback(() => {
    if (!selectedAccount) return
    if (selectedAccount === 'all') {
      Promise.all(accounts.map(acct =>
        axios.get(`/api/accounts/${acct.id}/monitor/active-alarms`)
          .then(res => ({ account_name: acct.name, alarms: res.data.success ? res.data.active_alarms : [] }))
          .catch(() => ({ account_name: acct.name, alarms: [] }))
      ))
        .then(results => {
          const all = results.flatMap(r => r.alarms.map(a => ({ ...a, account_name: r.account_name })))
          setActiveAlarms(all)
        })
    } else {
      axios.get(`/api/accounts/${selectedAccount}/monitor/active-alarms`)
        .then(res => {
          if (res.data.success) setActiveAlarms(res.data.active_alarms)
          else toast.error(res.data.error || '加载活跃告警失败')
        })
        .catch(err => toast.error('加载活跃告警失败: ' + (err.response?.data?.error || err.message)))
    }
  }, [selectedAccount, accounts])

  const loadMetrics = useCallback(() => {
    if (!selectedAccount) return
    setLoading(true)
    const metricList = [
      { namespace: 'acs_ecs_dashboard', metric: 'CPUUtilization', key: 'ecs_cpu' },
      { namespace: 'acs_ecs_dashboard', metric: 'memory_usedutilization', key: 'ecs_mem' },
      { namespace: 'acs_rds_dashboard', metric: 'CpuUsage', key: 'rds_cpu' },
      { namespace: 'acs_rds_dashboard', metric: 'MemoryUsage', key: 'rds_mem' },
    ]
    
    if (selectedAccount === 'all') {
      // 全部账号：请求所有账号的指标数据
      Promise.all(accounts.map(acct =>
        Promise.all(metricList.map(m =>
          axios.get(`/api/accounts/${acct.id}/monitor/metrics`, {
            params: { namespace: m.namespace, metric_name: m.metric }
          }).then(res => ({ key: m.key, data: res.data.success ? res.data.datapoints : [] }))
        )).then(results => ({ account_name: acct.name, metrics: results }))
      ))
        .then(results => {
          const newMetrics = {}
          metricList.forEach(m => { newMetrics[m.key] = [] })
          results.forEach(r => {
            r.metrics.forEach(m => {
              if (newMetrics[m.key]) newMetrics[m.key] = [...newMetrics[m.key], ...m.data]
            })
          })
          setMetrics(newMetrics)
        })
        .catch(err => toast.error('加载监控数据失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    } else {
      Promise.all(metricList.map(m =>
        axios.get(`/api/accounts/${selectedAccount}/monitor/metrics`, {
          params: { namespace: m.namespace, metric_name: m.metric }
        }).then(res => ({ key: m.key, data: res.data.success ? res.data.datapoints : [] }))
      ))
        .then(results => {
          const newMetrics = {}
          results.forEach(r => { newMetrics[r.key] = r.data })
          setMetrics(newMetrics)
        })
        .catch(err => toast.error('加载监控数据失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    }
  }, [selectedAccount, accounts])

  useEffect(() => {
    if (selectedAccount) {
      loadAlarms()
      loadActiveAlarms()
      loadMetrics()
    }
  }, [selectedAccount, loadAlarms, loadActiveAlarms, loadMetrics])

  const getAvgValue = (datapoints) => {
    if (!datapoints || datapoints.length === 0) return null
    const sum = datapoints.reduce((acc, d) => acc + (d.Average || d.Value || 0), 0)
    return (sum / datapoints.length).toFixed(1)
  }

  const getStatusColor = (value) => {
    if (value === null) return '#999'
    const num = parseFloat(value)
    if (num >= 90) return '#ff4d4f'
    if (num >= 70) return '#fa8c16'
    return '#52c41a'
  }

  const METRIC_CARDS = [
    { key: 'ecs_cpu', label: 'ECS CPU 使用率', unit: '%' },
    { key: 'ecs_mem', label: 'ECS 内存使用率', unit: '%' },
    { key: 'rds_cpu', label: 'RDS CPU 使用率', unit: '%' },
    { key: 'rds_mem', label: 'RDS 内存使用率', unit: '%' },
  ]

  const ALARM_STATUS_MAP = {
    'OK': { label: '正常', className: 'alarm-ok' },
    'ALARM': { label: '告警', className: 'alarm-alarm' },
    'INSUFFICIENT_DATA': { label: '数据不足', className: 'alarm-unknown' },
  }

  const NAMESPACE_MAP = {
    'acs_ecs': 'ECS 云服务器',
    'acs_ecs_dashboard': 'ECS 云服务器',
    'acs_rds': 'RDS 数据库',
    'acs_rds_dashboard': 'RDS 数据库',
    'acs_slb': 'SLB 负载均衡',
    'acs_slb_dashboard': 'SLB 负载均衡',
    'acs_oss': 'OSS 对象存储',
    'acs_kvstore': 'Redis 云数据库',
    'acs_kvstore_dashboard': 'Redis 云数据库',
    'acs_cdn': 'CDN 内容分发',
    'acs_nat_gateway': 'NAT 网关',
    'acs_mongodb': 'MongoDB',
    'acs_elasticsearch': 'Elasticsearch',
    'acs_cen': '云企业网',
    'acs_vpc_eip': '弹性公网 IP',
    'acs_vpn': 'VPN 网关',
    'acs_nas': 'NAS 文件存储',
    'acs_adb': 'AnalyticDB',
    'acs_polardb': 'PolarDB',
    'acs_dts': 'DTS 数据传输',
    'acs_waf': 'WAF 防火墙',
    'acs_ddos': 'DDoS 高防',
    'acs_strategy_sys': '系统策略',
  }

  const METRIC_MAP = {
    'cpu_total': 'CPU 使用率',
    'memory_usedutilization': '内存使用率',
    'diskusage_utilization': '磁盘使用率',
    'disk_readiops': '磁盘读 IOPS',
    'disk_writeiops': '磁盘写 IOPS',
    'net_tcpconnection': 'TCP 连接数',
    'networkin_rate': '入网流量速率',
    'networkout_rate': '出网流量速率',
    'load_5m': '5分钟负载',
    'CpuUsage': 'CPU 使用率',
    'MemoryUsage': '内存使用率',
    'DiskUsage': '磁盘使用率',
    'IOPSUsage': 'IOPS 使用率',
    'ConnectionUsage': '连接数使用率',
    'QPS': 'QPS',
    'ActiveConnection': '活跃连接数',
    'TransitRouterOutRate': '转发路由器出向流量速率',
    'TransitRouterInRate': '转发路由器入向流量速率',
    'InstanceActiveConnection': '实例活跃连接数',
    'InstanceDropConnection': '实例丢弃连接数',
    'InstancePacketRX': '实例收包速率',
    'InstancePacketTX': '实例发包速率',
    'Host.mem.usedutilization': '内存使用率',
    'Host.cpu.util': 'CPU 使用率',
    'Host.disk.util': '磁盘使用率',
  }

  const fmtExpression = (expr) => {
    if (!expr) return '-'
    return expr
      .replace(/\$Average/g, '平均值')
      .replace(/\$Maximum/g, '最大值')
      .replace(/\$Minimum/g, '最小值')
      .replace(/\$Sum/g, '总和')
      .replace(/\$SampleCount/g, '计数')
      .replace(/\$Value/g, '当前值')
      .replace(/&&/g, '且')
      .replace(/\|\|/g, '或')
  }

  const fmtResource = (res) => {
    if (!res || res === '{}') return '-'
    // 尝试解析 JSON 对象，提取实例ID
    try {
      if (res.startsWith('{')) {
        const obj = JSON.parse(res)
        const keys = ['instanceId', 'trInstanceId', 'InstanceId', 'BucketName', 'bucketName', 'vip', 'port']
        for (const k of keys) {
          if (obj[k]) return obj[k]
        }
        // 无匹配键，取第一个值
        const vals = Object.values(obj)
        return vals.length > 0 ? String(vals[0]) : res
      }
    } catch {}
    return res
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>云监控</h2>
      </div>

      {/* 搜索框*/}
      <div className="search-bar">
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="all">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="搜索告警规则、产品、监控项..."
          value={monitorKeyword}
          onChange={e => setMonitorKeyword(e.target.value)}
        />
        <button className="btn-primary" onClick={() => { loadAlarms(); loadActiveAlarms(); loadMetrics() }} disabled={loading}>
          {loading ? '查询中..' : '搜索'}
        </button>
        <button className="btn-default" onClick={() => { setSelectedAccount('all'); setMonitorKeyword('') }}>重置</button>
      </div>

      {/* 当前告警资源 */}
      <div className="section-block">
        <h3 style={{ color: filteredActiveAlarms.length > 0 ? '#ff4d4f' : '#333' }}>
          当前告警（{filteredActiveAlarms.length}{filteredActiveAlarms.length !== activeAlarms.length ? `/${activeAlarms.length}` : ''} 个）
        </h3>
        {activeAlarms.length === 0 ? (
          <div className="empty-state" style={{ color: '#52c41a' }}>暂无活跃告警</div>
        ) : filteredActiveAlarms.length === 0 ? (
          <div className="empty-state">未找到匹配"{monitorKeyword}"的告警</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {selectedAccount === 'all' && <th>所属账号</th>}
                  <th>告警规则</th>
                  <th>产品</th>
                  <th>监控项</th>
                  <th>告警条件</th>
                  <th>当前值</th>
                  <th>告警资源</th>
                  <th>告警时间</th>
                </tr>
              </thead>
              <tbody>
                {filteredActiveAlarms.map((a, idx) => (
                  <tr key={idx} className="alarm-row">
                    {selectedAccount === 'all' && <td>{a.account_name}</td>}
                    <td>{a.rule_name || '-'}</td>
                    <td>{NAMESPACE_MAP[a.namespace] || a.namespace || '-'}</td>
                    <td>{METRIC_MAP[a.metric_name] || a.metric_name || '-'}</td>
                    <td style={{ fontSize: 13 }}>{fmtExpression(a.expression)}</td>
                    <td className="td-mono" style={{ fontSize: 13, color: '#ef4444' }}>{a.value || '-'}</td>
                    <td className="td-mono" style={{ fontSize: 13 }}>{fmtResource(a.resource)}</td>
                    <td>{a.alarm_time ? fmtDate(a.alarm_time) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 监控指标卡片 */}
      <div className="section-block">
        <h3>资源使用率概览</h3>
        {loading ? (
          <div className="empty-state">加载中..</div>
        ) : (
          <div className="monitor-cards">
            {METRIC_CARDS.map(m => {
              const val = getAvgValue(metrics[m.key])
              return (
                <div key={m.key} className="monitor-card">
                  <div className="monitor-card-label">{m.label}</div>
                  <div className="monitor-card-value" style={{ color: getStatusColor(val) }}>
                    {val !== null ? `${val}${m.unit}` : '-'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 告警规则 */}
      <div className="section-block">
        <h3>告警规则（{filteredAlarms.length}{filteredAlarms.length !== alarms.length ? `/${alarms.length}` : ''} 条）</h3>
        {alarms.length === 0 ? (
          <div className="empty-state">暂无告警规则</div>
        ) : filteredAlarms.length === 0 ? (
          <div className="empty-state">未找到匹配"{monitorKeyword}"的规则</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {selectedAccount === 'all' && <th>所属账号</th>}
                  <th>规则名称</th>
                  <th>产品</th>
                  <th>监控项</th>
                  <th>状态</th>
                  <th>启用</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlarms.map((a, idx) => (
                  <tr key={`${a.account_name || ''}-${a.rule_id || idx}`}>
                    {selectedAccount === 'all' && <td>{a.account_name}</td>}
                    <td>{a.rule_name || '-'}</td>
                    <td>{NAMESPACE_MAP[a.namespace] || a.namespace || '-'}</td>
                    <td>{a.metric_name || '-'}</td>
                    <td>
                      <span className={`alarm-status ${ALARM_STATUS_MAP[a.alarm_status]?.className || 'alarm-unknown'}`}>
                        {ALARM_STATUS_MAP[a.alarm_status]?.label || a.alarm_status}
                      </span>
                    </td>
                    <td>{a.enable ? '是' : '否'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 日志管理 ====================
function LogManagement() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [logs, setLogs] = useState([])
  const [modules, setModules] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [module, setModule] = useState('')
  const [keyword, setKeyword] = useState('')
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  // 确认弹框
  const [confirmState, setConfirmState] = useState(null)
  const showConfirm = (msg) => new Promise(resolve => setConfirmState({ msg, onConfirm: () => { setConfirmState(null); resolve(true) }, onCancel: () => { setConfirmState(null); resolve(false) } }))

  const loadLogs = (p = 1) => {
    setLoading(true)
    const params = { page: p, page_size: pageSize }
    if (accountId) params.account_id = accountId
    if (module) params.module = module
    if (keyword.trim()) params.keyword = keyword.trim()
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    axios.get('/api/logs', { params })
      .then(res => {
        setLogs(res.data.logs || [])
        setTotal(res.data.total || 0)
        setModules(res.data.modules || [])
        setPage(res.data.page || 1)
      })
      .catch(err => toast.error('加载日志失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    axios.get('/api/accounts').then(res => setAccounts(res.data)).catch(() => {})
    loadLogs(1)
  }, [])

  const handleSearch = () => loadLogs(1)

  const handleReset = () => {
    setAccountId(''); setModule(''); setKeyword('')
    setDateFrom(today); setDateTo(today)
    setTimeout(() => loadLogs(1), 0)
  }

  const handleClear = async () => {
    const ok = await showConfirm('确定要清空全部操作日志吗？此操作不可恢复。')
    if (!ok) return
    axios.delete('/api/logs')
      .then(() => { toast.success('日志已清空'); loadLogs(1) })
      .catch(err => toast.error('清空失败: ' + (err.response?.data?.error || err.message)))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const fmtLogTime = (v) => {
    if (!v) return '-'
    const s = String(v)
    return s.length > 19 ? s.slice(0, 19) : s
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>日志管理</h2>
      </div>

      {/* 搜索框 */}
      <div className="search-bar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <label>账号：</label>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label>模块：</label>
        <select value={module} onChange={e => setModule(e.target.value)}>
          <option value="">全部模块</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <label>时间：</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color: '#94a3b8' }}>至</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <input
          type="text"
          placeholder="搜索操作/详情/账号"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ minWidth: 180 }}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>
          {loading ? '查询中..' : '搜索'}
        </button>
        <button className="btn-default" onClick={handleReset}>重置</button>
        {/* <button className="btn-default" style={{ marginLeft: 'auto', color: '#ef4444' }} onClick={handleClear}>清空全部操作日志</button> */}
      </div>

      {/* 日志表格 */}
      <div className="overview-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 160 }}>时间</th>
              <th style={{ width: 120, whiteSpace: 'nowrap' }}>账号</th>
              <th style={{ width: 100, whiteSpace: 'nowrap' }}>模块</th>
              <th style={{ width: 130, whiteSpace: 'nowrap' }}>操作</th>
              <th style={{ width: 80 }}>结果</th>
              <th>操作详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                {loading ? '加载中..' : '暂无操作日志'}
              </td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtLogTime(log.created_at)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{log.account_name || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{log.module || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{log.action || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className={`alarm-status ${log.success === 1 ? 'alarm-ok' : 'alarm-alarm'}`}>
                    {log.success === 1 ? '成功' : '失败'}
                  </span>
                </td>
                <td>
                  {log.detail || '-'}
                  {log.success === 0 && log.error_msg && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginTop: 2 }}>{log.error_msg}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 14, fontSize: 14, color: '#64748b' }}>
          <span>共 {total} 条</span>
          <button className="btn-default" disabled={page <= 1 || loading} onClick={() => loadLogs(page - 1)}>上一页</button>
          <span>{page} / {totalPages}</span>
          <button className="btn-default" disabled={page >= totalPages || loading} onClick={() => loadLogs(page + 1)}>下一页</button>
        </div>
      )}
      {confirmState && (
        <ConfirmModal message={confirmState.msg} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      )}
    </div>
  )
}

// ==================== 主应用组件====================
const PAGE_LABELS = {
  overview: '资源概览',
  resources: '资源管理',
  bills: '账单管理',
  accounts: '账号管理',
  ram: 'RAM 管理',
  dns: '域名管理',
  ssl: 'SSL 证书',
  monitor: '云监控',
  logs: '日志管理',
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()

  // 从 URL pathname 获取当前页面（HashRouter 中 pathname 是 /））
  // HashRouter 使用 location.hash，但 useLocation 返回的 pathname 在 HashRouter 中实际是 hash 路径
  const getPage = () => {
    // HashRouter 中 useLocation 的 pathname 就是 hash 路径（去掉 # 后的部分）
    const path = location.pathname.replace(/^\//, '')
    return PAGE_LABELS[path] ? path : 'overview'
  }

  const activeMenu = getPage()

  const setActiveMenu = (page) => {
    navigate('/' + page)
  }

  // 默认跳转到 /overview
  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/overview', { replace: true })
    }
  }, [])

  const renderPage = () => {
    switch (activeMenu) {
      case 'overview': return <ResourceOverview />
      case 'resources': return <ResourceManagement />
      case 'bills': return <BillManagement />
      case 'accounts': return <AccountManagement />
      case 'ram': return <RamManagement />
      case 'dns': return <DnsManagement />
      case 'ssl': return <SslManagement />
      case 'monitor': return <CloudMonitor />
      case 'logs': return <LogManagement />
      default: return <ResourceOverview />
    }
  }

  return (
    <div className="app-layout">
      <Sidebar activeMenu={activeMenu} onMenuChange={setActiveMenu} />
      <div className="main-area">
        <main className="content-area">
          <LoadingBar />
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

export { ToastProvider }
export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
