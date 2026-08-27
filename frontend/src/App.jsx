import { useState, useEffect, useCallback, useMemo, Fragment, Component, createContext, useContext, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import './App.css'

// 设置 axios 默认超时：同步操作可能耗时较长，请设置 10 分钟
axios.defaults.timeout = 600000

// ==================== 年月选择弹窗（通用组件）====================
function MonthPickerModal({ open, onClose, title, year, onYearChange, value, onChange, statusText, onConfirm, confirmLabel }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#334155' }}>选择月份</label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
              <button type="button" style={{ padding: '4px 12px', fontSize: 18, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', color: '#334155', lineHeight: 1 }} onClick={() => onYearChange(year - 1)}>‹</button>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', minWidth: 60, textAlign: 'center' }}>{year}年</span>
              <button type="button" style={{ padding: '4px 12px', fontSize: 18, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', color: '#334155', lineHeight: 1 }} onClick={() => onYearChange(year + 1)}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                const val = `${year}-${String(m).padStart(2, '0')}`
                const selected = value === val
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange(selected ? '' : val)}
                    style={{
                      padding: '8px 0', borderRadius: 8, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                      border: selected ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      background: selected ? '#eef2ff' : '#fff',
                      color: selected ? '#6366f1' : '#334155',
                      fontWeight: selected ? 600 : 400
                    }}
                  >{m}月</button>
                )
              })}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, textAlign: 'center' }}>
            {statusText}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-default" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={onConfirm}>{confirmLabel || '确定'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

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
          <p style={{ color: '#64748b', marginTop: 12 }}>{this.state.error?.message || '未知错误'}</p>
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

// ==================== 菜单导航上下文 ====================
const MenuContext = createContext(null)

// ==================== 全局搜索过滤上下文 ====================
const SearchFilterContext = createContext(null)

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
  const defaultMenus = [
    { key: 'overview', label: '资源概览', icon: '' },
    { key: 'resources', label: '资源管理', icon: '' },
    { key: 'network', label: '网络管理', icon: '' },
    { key: 'publicip', label: '公网大全', icon: '' },
    { key: 'weblinks', label: '网址大全', icon: '' },
    { key: 'bills', label: '账单管理', icon: '' },
    { key: 'ram', label: 'RAM 管理', icon: '' },
    { key: 'dns', label: '域名管理', icon: '' },
    { key: 'ssl', label: 'SSL 证书', icon: '' },
    { key: 'security', label: '安全事件', icon: '' },
    { key: 'monitor', label: '监控管理', icon: '' },
    { key: 'logs', label: '日志管理', icon: '' },
    { key: 'accounts', label: '平台设置', icon: '' },
  ]

  const [menus, setMenus] = useState(defaultMenus)
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // 从服务器加载菜单顺序
  useEffect(() => {
    axios.get('/api/menu-order').then(res => {
      const order = res.data.order
      if (order && Array.isArray(order)) {
        const menuMap = Object.fromEntries(defaultMenus.map(m => [m.key, m]))
        const ordered = order.map(key => menuMap[key]).filter(Boolean)
        // 添加新增的菜单项（如果有）
        const existingKeys = new Set(ordered.map(m => m.key))
        defaultMenus.forEach(m => {
          if (!existingKeys.has(m.key)) ordered.push(m)
        })
        setMenus(ordered)
      }
    }).catch(() => {})
  }, [])

  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) return

    const newMenus = [...menus]
    const [draggedItem] = newMenus.splice(dragIndex, 1)
    newMenus.splice(dropIndex, 0, draggedItem)
    setMenus(newMenus)

    // 保存到服务器
    axios.put('/api/menu-order', { order: newMenus.map(m => m.key) }).catch(() => {})

    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">阿里云资源平台</span>
      </div>
      <nav className="sidebar-nav">
        {menus.map((menu, index) => (
          <div
            key={menu.key}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`sidebar-menu-item ${activeMenu === menu.key ? 'active' : ''} ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index && dragIndex !== index ? 'drag-over' : ''}`}
            onClick={() => onMenuChange(menu.key)}
          >
            <span className="menu-label">{menu.label}</span>
          </div>
        ))}
      </nav>
    </div>
  )
}

// ==================== 骨架屏组件 ====================
function SkeletonOverview() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h2>资源概览</h2>
      </div>
      <div className="skeleton-cards">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="skeleton-section" style={{ padding: 20 }}>
            <div className="skeleton skeleton-line" style={{ width: '40%' }}></div>
            <div className="skeleton skeleton-card" style={{ height: 36 }}></div>
          </div>
        ))}
      </div>
      <div className="skeleton-section">
        <div className="skeleton skeleton-line" style={{ width: '30%', marginBottom: 16 }}></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton-table-row">
            <div className="skeleton skeleton-table-cell"></div>
            <div className="skeleton skeleton-table-cell"></div>
            <div className="skeleton skeleton-table-cell"></div>
            <div className="skeleton skeleton-table-cell"></div>
            <div className="skeleton skeleton-table-cell"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonTable({ columns = 6, rows = 5 }) {
  return (
    <div className="skeleton-section">
      <div className="skeleton skeleton-line" style={{ width: '25%', marginBottom: 16 }}></div>
      <div style={{ borderTop: '1px solid #f1f5f9' }}>
        <div className="skeleton-table-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
          {[...Array(columns)].map((_, i) => (
            <div key={i} className="skeleton skeleton-table-cell" style={{ height: 12 }}></div>
          ))}
        </div>
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="skeleton-table-row">
            {[...Array(columns)].map((_, j) => (
              <div key={j} className="skeleton skeleton-table-cell"></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// 通用状态标签映射
const STATUS_LABELS = {
  'Running': '运行中', 'Stopped': '已停止', 'Pending': '创建中', 'Starting': '启动中', 'Stopping': '停止中',
  'Available': '可用', 'Unavailable': '不可用',
  'Active': '正常', 'Inactive': '异常',
  'Normal': '正常', 'Abnormal': '异常',
  'InUse': '使用中', 'Expired': '已过期',
}

// 区域标签映射
const REGION_LABELS = {
  'cn-hangzhou': '华东1（杭州）', 'cn-shanghai': '华东2（上海）', 'cn-nanjing': '华东5（南京）',
  'cn-beijing': '华北2（北京）', 'cn-qingdao': '华北1（青岛）', 'cn-zhangjiakou': '华北3（张家口）',
  'cn-huhehaote': '华北5（呼和浩特）', 'cn-wulanchabu': '华北6（乌兰察布）',
  'cn-shenzhen': '华南1（深圳）', 'cn-heyuan': '华南2（河源）', 'cn-guangzhou': '华南3（广州）',
  'cn-chengdu': '西南1（成都）', 'cn-hongkong': '中国香港',
  'ap-southeast-1': '新加坡', 'ap-southeast-2': '悉尼', 'ap-southeast-3': '吉隆坡',
  'ap-southeast-5': '雅加达', 'ap-southeast-6': '马尼拉', 'ap-southeast-7': '泰国（曼谷）',
  'ap-northeast-1': '东京', 'ap-northeast-2': '韩国（首尔）', 'ap-south-1': '孟买',
  'us-east-1': '美国（弗吉尼亚）', 'us-west-1': '美国（硅谷）',
  'eu-west-1': '英国（伦敦）', 'eu-central-1': '德国（法兰克福）', 'me-east-1': '阿联酋（迪拜）',
}

// ==================== 通用 Hooks ====================

function useSortable(defaultKey = '', defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const sortArrow = (key) => {
    if (sortKey !== key) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }
  const sortData = (data, columns) => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const col = columns?.find(c => c.key === sortKey)
      if (col?.type === 'number' || typeof va === 'number') {
        const na = Number(va), nb = Number(vb)
        if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
      }
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }
  return { sortKey, sortDir, setSortKey, setSortDir, handleSort, sortArrow, sortData }
}

function useDebounceSearch(initialDelay = 300) {
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearchKeyword(keyword), initialDelay)
    return () => clearTimeout(t)
  }, [keyword, initialDelay])
  const resetSearch = () => { setKeyword(''); setSearchKeyword('') }
  return { keyword, setKeyword, searchKeyword, resetSearch }
}

/**
 * 确认弹框 Hook（封装 confirmState + showConfirm + ConfirmModal 渲染）
 * 用法：const { showConfirm, confirmNode } = useConfirm()
 *       const ok = await showConfirm('确定？')
 *       渲染位置：{confirmNode}
 */
function useConfirm() {
  const [confirmState, setConfirmState] = useState(null)
  const showConfirm = (msg) => new Promise(resolve => setConfirmState({
    msg,
    onConfirm: () => { setConfirmState(null); resolve(true) },
    onCancel: () => { setConfirmState(null); resolve(false) }
  }))
  const confirmNode = confirmState && (
    <ConfirmModal message={confirmState.msg} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
  )
  return { showConfirm, confirmNode }
}

/**
 * 账号列表加载 Hook
 * 用法：const { accounts, setAccounts } = useAccounts()
 */
function useAccounts() {
  const [accounts, setAccounts] = useState([])
  useEffect(() => {
    axios.get('/api/accounts').then(res => setAccounts(res.data)).catch(() => {})
  }, [])
  return { accounts, setAccounts }
}

/**
 * 管理页面基础 Hook（封装 toast + confirm + accounts）
 * 用法：const { toast, showConfirm, confirmNode, accounts } = useManagementBase()
 */
function useManagementBase() {
  const toast = useToast()
  const { showConfirm, confirmNode } = useConfirm()
  const { accounts, setAccounts } = useAccounts()
  return { toast, showConfirm, confirmNode, accounts, setAccounts }
}

// ==================== 通用渲染工具 ====================

const nowrap = v => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
const renderRegion = v => nowrap(REGION_LABELS[v] || v)

// 高亮搜索关键词
const highlightKeyword = (text, keyword) => {
  if (!text || !keyword || !keyword.trim()) return text
  const str = String(text)
  const kw = keyword.trim()
  const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = str.split(regex)
  return parts.map((part, i) => 
    regex.test(part) 
      ? <span key={i} style={{ color: '#ef4444', fontWeight: 600 }}>{part}</span>
      : part
  )
}

// 区域ID转短名称
const REGION_SHORT_NAMES = {
  'cn-hangzhou': '杭州', 'cn-shanghai': '上海', 'cn-nanjing': '南京',
  'cn-beijing': '北京', 'cn-qingdao': '青岛', 'cn-zhangjiakou': '张家口',
  'cn-huhehaote': '呼和浩特', 'cn-wulanchabu': '乌兰察布',
  'cn-shenzhen': '深圳', 'cn-heyuan': '河源', 'cn-guangzhou': '广州',
  'cn-chengdu': '成都', 'cn-hongkong': '香港',
  'ap-southeast-1': '新加坡', 'ap-southeast-2': '悉尼', 'ap-southeast-3': '吉隆坡',
  'ap-southeast-5': '雅加达', 'ap-southeast-6': '马尼拉', 'ap-southeast-7': '曼谷',
  'ap-northeast-1': '东京', 'ap-northeast-2': '首尔', 'ap-south-1': '孟买',
  'us-east-1': '弗吉尼亚', 'us-west-1': '硅谷',
  'eu-west-1': '伦敦', 'eu-central-1': '法兰克福', 'me-east-1': '迪拜',
}
const formatRegion = (text) => {
  if (!text) return text
  const str = String(text)
  return str.replace(/cn-[a-z]+|ap-[a-z]+-[0-9]+|us-[a-z]+-[0-9]+|eu-[a-z]+-[0-9]+|me-[a-z]+-[0-9]+/g, 
    match => REGION_SHORT_NAMES[match] || match
  )
}

// ==================== 资源概览页面 ====================
function ResourceOverview() {
  const { onMenuChange } = useContext(MenuContext)
  const searchFilterCtx = useContext(SearchFilterContext)
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(false)
  const { sortKey: ovSortKey, sortDir: ovSortDir, handleSort: handleOvSort, sortArrow: ovSortArrow } = useSortable()

  // 全局搜索
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [skipAutoSearch, setSkipAutoSearch] = useState(false)

  // 恢复搜索状态（从其他页面返回时）
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.page === 'overview') {
      const { keyword, results } = searchFilterCtx.searchFilter
      if (keyword) setSearchKeyword(keyword)
      if (results) {
        setSearchResults(results)
        setShowResults(true)
      }
      // 跳过自动搜索，避免覆盖恢复的结果
      setSkipAutoSearch(true)
      // 清除过滤状态
      searchFilterCtx.setSearchFilter(null)
    }
  }, [searchFilterCtx?.searchFilter])

  const loadData = useCallback(() => {
    setLoading(true)
    axios.get('/api/overview')
      .then(res => setOverview(res.data))
      .catch(err => console.error('加载概览失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 实时搜索（防抖 400ms）
  useEffect(() => {
    // 跳过自动搜索（恢复状态时）
    if (skipAutoSearch) {
      setSkipAutoSearch(false)
      return
    }

    const kw = searchKeyword.trim()
    if (!kw) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    const timer = setTimeout(() => {
      setSearching(true)
      setShowResults(true)
      axios.get('/api/global-search', { params: { keyword: kw } })
        .then(res => {
          setSearchResults(res.data.results || [])
        })
        .catch(err => {
          console.error('搜索失败:', err)
          toast.error('搜索失败: ' + (err.response?.data?.error || err.message))
          setSearchResults([])
        })
        .finally(() => setSearching(false))
    }, 400)

    return () => clearTimeout(timer)
  }, [searchKeyword, skipAutoSearch])

  // 立即搜索（用于按钮和回车键）
  const handleGlobalSearch = () => {
    const kw = searchKeyword.trim()
    if (!kw) {
      setSearchResults([])
      setShowResults(false)
      return
    }
    setSearching(true)
    setShowResults(true)
    axios.get('/api/global-search', { params: { keyword: kw } })
      .then(res => {
        setSearchResults(res.data.results || [])
      })
      .catch(err => {
        console.error('搜索失败:', err)
        toast.error('搜索失败: ' + (err.response?.data?.error || err.message))
        setSearchResults([])
      })
      .finally(() => setSearching(false))
  }

  const handleResultClick = (item) => {
    // 保存搜索状态，以便返回时恢复
    if (searchFilterCtx) {
      searchFilterCtx.setSearchFilter({
        page: 'overview',
        keyword: searchKeyword,
        results: searchResults
      })
    }
    // 传递过滤信息到目标页面
    const filter = {
      keyword: searchKeyword,
      type_key: item.type_key,
      tab: item.page === 'resources' ? item.type_key : null
    }
    onMenuChange(item.page, filter)
  }

  // 按类型分组结果
  const groupedResults = useMemo(() => {
    const groups = {}
    searchResults.forEach(r => {
      if (!groups[r.type]) groups[r.type] = []
      groups[r.type].push(r)
    })
    return groups
  }, [searchResults])

  const totalEcs = overview.reduce((s, a) => s + a.ecs_count, 0)
  const totalRds = overview.reduce((s, a) => s + a.rds_count, 0)
  const totalSlb = overview.reduce((s, a) => s + a.slb_count, 0)
  const totalOss = overview.reduce((s, a) => s + a.oss_count, 0)
  const totalRedis = overview.reduce((s, a) => s + a.redis_count, 0)
  const totalMonthAmount = overview.filter(a => a.currency !== 'SGD').reduce((s, a) => s + a.month_amount, 0)
  const totalBalance = overview.filter(a => a.currency !== 'SGD').reduce((s, a) => s + a.available_amount, 0)

  // 首次加载显示骨架屏
  if (loading && overview.length === 0) {
    return <SkeletonOverview />
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>资源概览</h2>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          {loading ? '刷新中..' : '刷新'}
        </button>
      </div>

      {/* 全局搜索栏 */}
      <div className="section-block" style={{ padding: '16px 20px' }}>
        <div className="search-bar" style={{ marginBottom: 0 }}>
          <input
            type="text"
            placeholder="全局搜索：资源名称、IP、实例ID、域名、账号..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
            style={{ minWidth: 360, fontSize: 14 }}
          />
          <button className="btn-primary" onClick={handleGlobalSearch} disabled={searching}>
            {searching ? '搜索中..' : '搜索'}
          </button>
          {showResults && (
            <button className="btn-default" onClick={() => { setShowResults(false); setSearchResults([]); setSearchKeyword('') }}>
              清除
            </button>
          )}
        </div>

        {/* 搜索结果 */}
        {showResults && (
          <div style={{ marginTop: 16 }}>
            {searching ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>搜索中...</div>
            ) : searchResults.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                未找到与 "<span style={{ color: '#334155', fontWeight: 500 }}>{searchKeyword}</span>" 相关的结果
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                  共找到 <span style={{ color: '#6366f1', fontWeight: 600 }}>{searchResults.length}</span> 条结果
                </div>
                {Object.entries(groupedResults).map(([type, items]) => (
                  <div key={type} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{type}</span>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>({items.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map((item, idx) => (
                        <div
                          key={idx}
                          className="search-result-item"
                          onClick={() => handleResultClick(item)}
                        >
                          <span style={{ fontWeight: 500, color: '#0f172a' }}>{highlightKeyword(item.name, searchKeyword)}</span>
                          {item.detail && (
                            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 12 }}>{highlightKeyword(formatRegion(item.detail), searchKeyword)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
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
        <div className="summary-card highlight">
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
                  {[
                    { key: 'account_name', label: '账号名称' },
                    { key: 'remark', label: '备注' },
                    { key: 'ecs_count', label: 'ECS' },
                    { key: 'rds_count', label: 'RDS' },
                    { key: 'slb_count', label: 'SLB' },
                    { key: 'oss_count', label: 'OSS' },
                    { key: 'redis_count', label: 'Redis' },
                    { key: 'month_amount', label: '本月消费' },
                    { key: 'available_amount', label: '可用额度' },
                  ].map(col => (
                    <th
                      key={col.key}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleOvSort(col.key)}
                    >
                      {col.label}{ovSortArrow(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...overview].sort((a, b) => {
                  let va = a[ovSortKey] ?? ''
                  let vb = b[ovSortKey] ?? ''
                  if (typeof va === 'number' && typeof vb === 'number') {
                    return ovSortDir === 'asc' ? va - vb : vb - va
                  }
                  const sa = String(va), sb = String(vb)
                  return ovSortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
                }).map(item => {
                  const sym = item.currency === 'SGD' ? 'SGD ' : '¥'
                  return (
                  <tr key={item.account_id}>
                    <td>{item.account_name}</td>
                    <td>{item.remark || '-'}</td>
                    <td>{item.ecs_count}</td>
                    <td>{item.rds_count}</td>
                    <td>{item.slb_count}</td>
                    <td>{item.oss_count}</td>
                    <td>{item.redis_count}</td>
                    <td className="td-amount">{sym}{fmtMoney(item.month_amount)}</td>
                    <td className={(item.available_amount < (item.balance_threshold || 20000)) ? 'td-amount-danger' : 'td-amount'}>{sym}{fmtMoney(item.available_amount)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="page-note">* 当账号的可用额度低于其设定的预警阈值时，将以<span style={{ color: '#ef4444', fontWeight: 600 }}>红色</span>显示，可在账号设置中自定义每个账号的阈值。</div>
      <div className="page-note">* 右上角的「本月消费」和「可用额度」汇总仅统计人民币账户，新加坡元账户不参与汇总。</div>
    </div>
  )
}

// ==================== 资源管理页面 ====================
function ResourceManagement() {
  const searchFilterCtx = useContext(SearchFilterContext)
  
  // 从搜索过滤上下文初始化状态
  const getInitialState = () => {
    const filter = searchFilterCtx?.searchFilter
    if (filter && filter.tab && ['ecs', 'rds', 'slb', 'oss', 'redis'].includes(filter.tab)) {
      return {
        activeTab: filter.tab,
        keyword: filter.keyword || '',
        searchKeyword: filter.keyword || ''
      }
    }
    return { activeTab: 'ecs', keyword: '', searchKeyword: '' }
  }
  
  const [activeTab, setActiveTab] = useState(() => getInitialState().activeTab)
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [keyword, setKeyword] = useState(() => getInitialState().keyword)
  const [searchKeyword, setSearchKeyword] = useState(() => getInitialState().searchKeyword)
  const [statusFilter, setStatusFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const { sortKey, sortDir, setSortKey, setSortDir, handleSort, sortArrow } = useSortable()
  const [regions, setRegions] = useState([])

  // 清除搜索过滤状态（已消费）
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.tab) {
      searchFilterCtx.setSearchFilter(null)
    }
  }, [])

  // 各Tab的列定义（sortable标记可排序列）
  const tabColumns = {
    ecs: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{STATUS_LABELS[v] || v}</span> },
      { key: 'instance_type', label: '规格', sortable: true },
      { key: 'cpu', label: 'CPU', sortable: true },
      { key: 'memory_gb', label: '内存(GB)', sortable: true },
      { key: 'private_ip', label: '内网IP', sortable: true },
      { key: 'public_ip', label: '公网IP', sortable: true },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
      { key: 'renewal_price', label: '月续费', sortable: true, render: (v, row) => {
        if (v !== null && v !== undefined) return <span style={{ color: '#d97706', fontWeight: 500 }}>¥{fmtMoney(v)}</span>
        return <span style={{ color: '#94a3b8' }}>-</span>
      }},
    ],
    rds: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'engine', label: '引擎', sortable: true },
      { key: 'engine_version', label: '版本', sortable: true },
      { key: 'instance_type', label: '类型', sortable: true, render: v => ({ Primary: '主实例', Readonly: '只读实例', Guard: '灾备实例', Temp: '临时实例' }[v] || v) },
      { key: 'instance_cpu', label: 'CPU', sortable: true, render: v => v ? `${v}核` : '-' },
      { key: 'instance_memory', label: '内存(GB)', sortable: true, render: v => {
        if (!v) return '-'
        const mem = parseFloat(v)
        return mem >= 1024 ? Math.round(mem / 1024) : mem
      }},
      { key: 'instance_storage', label: '存储', sortable: true, render: v => {
        if (!v) return '-'
        const storage = parseFloat(v)
        if (storage >= 1024) return `${(storage / 1024).toFixed(1)}TB`
        return `${storage}GB`
      }},
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
      { key: 'renewal_price', label: '月续费', sortable: true, render: (v, row) => {
        if (v !== null && v !== undefined) return <span style={{ color: '#d97706', fontWeight: 500 }}>¥{fmtMoney(v)}</span>
        return <span style={{ color: '#94a3b8' }}>-</span>
      }},
    ],
    slb: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'address', label: '地址', sortable: true, className: 'td-mono' },
      { key: 'address_type', label: '地址类型', sortable: true, render: v => ({ internet: '公网', intranet: '内网' }[v] || v) },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{({ active: '运行中', inactive: '已停止', locked: '已锁定' }[v] || STATUS_LABELS[v] || v)}</span> },
      { key: 'network_type', label: '网络类型', sortable: true, render: v => ({ vpc: 'VPC', classic: '经典网络' }[v] || v) },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
    ],
    oss: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'bucket_name', label: 'Bucket名称', sortable: true, className: 'td-mono' },
      { key: 'location', label: '区域', sortable: true, render: v => {
        const regionId = v?.replace(/^oss-/, '') || v
        return <span style={{ whiteSpace: 'nowrap' }}>{REGION_LABELS[regionId] || regionId}</span>
      }},
      { key: 'storage_class', label: '存储类型', sortable: true, render: v => ({ Standard: '标准存储', IA: '低频访问', Archive: '归档存储', ColdArchive: '冷归档' }[v] || v) },
      { key: 'creation_date', label: '创建时间', sortable: true, render: v => fmtDate(v) },
    ],
    redis: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '实例ID', sortable: true },
      { key: 'instance_name', label: '实例名称', sortable: true },
      { key: 'architecture_type', label: '架构', sortable: true, render: v => ({ standard: '标准版', cluster: '集群版', rwsplit: '读写分离版' }[v] || v) },
      { key: 'capacity', label: '容量', sortable: true },
      { key: 'engine_version', label: '版本', sortable: true },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
      { key: 'renewal_price', label: '月续费', sortable: true, render: (v, row) => {
        if (v !== null && v !== undefined) return <span style={{ color: '#d97706', fontWeight: 500 }}>¥{fmtMoney(v)}</span>
        return <span style={{ color: '#94a3b8' }}>-</span>
      }},
    ],
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
    if (searchKeyword) params.keyword = searchKeyword
    if (statusFilter) params.status = statusFilter
    if (regionFilter) params.region = regionFilter

    axios.get(`/api/${activeTab}`, { params })
      .then(res => setData(res.data))
      .catch(err => console.error('加载数据失败:', err))
      .finally(() => setLoading(false))
  }, [activeTab, selectedAccount, searchKeyword, statusFilter, regionFilter])

  useEffect(() => { loadData() }, [loadData])

  // 防抖自动搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchKeyword(keyword)
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword])

  const handleSearch = () => { setSearchKeyword(keyword) }
  const handleReset = () => {
    setSelectedAccount('')
    setKeyword('')
    setSearchKeyword('')
    setStatusFilter('')
    setRegionFilter('')
    setSortKey('')
    setSortDir('asc')
  }

  // 排序后的数据
  const sortedData = (() => {
    const arr = [...data]
    // 默认按创建时间倒序（新的在前）
    if (!sortKey) {
      const dateKey = activeTab === 'oss' ? 'creation_date' : 'created_time'
      arr.sort((a, b) => {
        const da = a[dateKey] || '', db = b[dateKey] || ''
        return db.localeCompare(da) // 倒序
      })
      return arr
    }
    const cols = tabColumns[activeTab]
    const col = cols.find(c => c.key === sortKey)
    if (!col || !col.sortable) return data
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
      } else if (sortKey === 'renewal_price') {
        va = a.renewal_price || 0
        vb = b.renewal_price || 0
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
      const val = item.memory ? (item.memory / 1024).toFixed(item.memory % 1024 === 0 ? 0 : 1) : '-'
      return keyword ? highlightKeyword(val, keyword) : val
    }
    if (col.key === 'capacity' && activeTab === 'redis') {
      if (!item.capacity) return '-'
      const mb = parseFloat(item.capacity)
      const val = mb < 1024 ? `${mb}M` : `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)}G`
      return keyword ? highlightKeyword(val, keyword) : val
    }
    const raw = item[col.key]
    if (col.render) {
      const rendered = col.render(raw, item)
      // 如果有关键词且渲染结果是字符串，应用高亮
      if (keyword && typeof rendered === 'string') {
        return highlightKeyword(rendered, keyword)
      }
      return rendered
    }
    const val = raw || '-'
    return keyword ? highlightKeyword(val, keyword) : val
  }

  const tabs = [
    { key: 'ecs', label: 'ECS' },
    { key: 'rds', label: 'RDS' },
    { key: 'redis', label: 'Redis' },
    { key: 'slb', label: 'SLB' },
    { key: 'oss', label: 'OSS' },
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
                style={col.sortable ? { cursor: 'pointer', userSelect: 'none' } : {}}
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

  // 首次加载显示骨架屏
  if (loading && data.length === 0) {
    return (
      <div className="page-content">
        <div className="page-header">
          <h2>资源管理</h2>
        </div>
        <SkeletonTable columns={7} rows={8} />
      </div>
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>资源管理</h2>
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

      {/* 资源类型Tab */}
      <div className="resource-tabs">
        {tabs.map(tab => (
          <div
            key={tab.key}
            className={`resource-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.key); setSortKey(''); }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* 数据表格 */}
      <div className="section-block">
        <div className="table-info">共{data.length}条记录{sortKey ? '(已排序)' : ''}</div>
        <div className="overview-table-wrap">
          {renderTable()}
        </div>
      </div>
    </div>
  )
}

// ==================== 公网大全页面 ====================
function PublicIPManagement() {
  const { toast, showConfirm, confirmNode, accounts } = useManagementBase()
  const searchFilterCtx = useContext(SearchFilterContext)
  const [allIPs, setAllIPs] = useState([])
  const [loading, setLoading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingIP, setEditingIP] = useState(null)
  const [formData, setFormData] = useState({ source: 'huawei', ip_address: '', remark: '' })
  const { sortKey, sortDir, handleSort, sortArrow, sortData } = useSortable()
  // 导入相关
  const importFileRef = useRef(null)
  const [importData, setImportData] = useState(null) // { items: [...], fileName: '' }
  const [importing, setImporting] = useState(false)
  // 来源名称配置
  const [sourceLabels, setSourceLabels] = useState([{ source: 'huawei', label: '华为云' }, { source: 'idc', label: 'IDC' }, { source: 'office', label: '居然大厦' }])
  const [showLabelSettings, setShowLabelSettings] = useState(false)
  const [editLabels, setEditLabels] = useState([])
  const [newSourceName, setNewSourceName] = useState('')

  // 读取全局搜索过滤
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.type_key === 'publicip') {
      const kw = searchFilterCtx.searchFilter.keyword
      if (kw) setKeyword(kw)
      searchFilterCtx.setSearchFilter(null)
    }
  }, [searchFilterCtx?.searchFilter])

  const SOURCE_COLORS = {
    aliyun_eip: { bg: '#eef2ff', color: '#4f46e5', border: '#c7d2fe' },
    aliyun_slb: { bg: '#eef2ff', color: '#4f46e5', border: '#c7d2fe' },
    huawei: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    idc: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    office: { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
  }

  const loadData = useCallback(() => {
    setLoading(true)
    axios.get('/api/public-ips')
      .then(res => setAllIPs(res.data))
      .catch(err => console.error('加载公网IP失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    axios.get('/api/source-labels').then(res => setSourceLabels(res.data)).catch(() => {})
  }, [])

  const labelMap = Object.fromEntries(sourceLabels.map(s => [s.source, s.label]))

  const openLabelSettings = () => {
    setEditLabels(sourceLabels.map(s => ({ ...s })))
    setShowLabelSettings(true)
  }

  const saveLabels = () => {
    axios.put('/api/source-labels', editLabels)
      .then(() => {
        setSourceLabels(editLabels)
        setShowLabelSettings(false)
        toast.success('来源名称已更新')
      })
      .catch(err => toast.error('保存失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleAdd = () => {
    setFormData({ source: 'huawei', ip_address: '', remark: '' })
    setEditingIP(null)
    setShowForm(true)
  }
  const handleEdit = (ip) => {
    setFormData({ source: ip.source, ip_address: ip.ip_address, remark: ip.remark || '' })
    setEditingIP(ip)
    setShowForm(true)
  }
  const handleSubmit = () => {
    if (!formData.ip_address.trim()) {
      toast.warning('请填写IP地址')
      return
    }
    if (editingIP) {
      axios.put(`/api/public-ips/${editingIP.id}`, formData)
        .then(() => { toast.success('更新成功'); setShowForm(false); loadData() })
        .catch(err => toast.error('更新失败: ' + (err.response?.data?.error || err.message)))
    } else {
      // 支持多个IP，按换行/逗号/空格分隔
      const ips = formData.ip_address.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
      if (ips.length === 0) {
        toast.warning('请填写IP地址')
        return
      }
      const items = ips.map(ip => ({ source: formData.source, ip_address: ip, remark: formData.remark }))
      axios.post('/api/public-ips/batch-import', { items })
        .then(res => { toast.success(res.data.message); setShowForm(false); loadData() })
        .catch(err => toast.error('添加失败: ' + (err.response?.data?.error || err.message)))
    }
  }
  const handleDelete = async (ip) => {
    const ok = await showConfirm(`确定要删除 IP「${ip.ip_address}」吗？`)
    if (!ok) return
    axios.delete(`/api/public-ips/${ip.id}`)
      .then(() => { toast.success('删除成功'); loadData() })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }

  // 动态加载 SheetJS
  const loadXLSX = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX)
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    script.onload = () => resolve(window.XLSX)
    script.onerror = () => reject(new Error('加载Excel解析库失败'))
    document.head.appendChild(script)
  })

  // 下载Excel模板
  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await loadXLSX()
      const wsData = [
        ['来源', 'IP地址', '备注'],
        [labelMap.huawei || '华为云', '1.2.3.4', '示例IP'],
        [labelMap.idc || 'IDC', '5.6.7.8', '办公网络'],
        [labelMap.office || '居然大厦', '9.10.11.12', '大厦出口'],
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '公网IP')
      XLSX.writeFile(wb, '公网IP导入模板.xlsx')
    } catch (err) {
      toast.error('生成模板失败')
    }
  }

  // 解析Excel文件（支持动态标签名称）
  const SOURCE_MAP = {
    'huawei': 'huawei', 'idc': 'idc', 'office': 'office',
    '华为云': 'huawei', 'IDC': 'idc', '居然大厦': 'office', '办公大厦': 'office',
    [labelMap.huawei]: 'huawei', [labelMap.idc]: 'idc', [labelMap.office]: 'office',
  }
  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const XLSX = await loadXLSX()
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      if (rows.length < 2) {
        toast.warning('文件内容为空或只有表头')
        return
      }
      const items = []
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].map(c => String(c || '').trim())
        const sourceRaw = cols[0] || ''
        const source = SOURCE_MAP[sourceRaw] || ''
        const ip_address = cols[1] || ''
        const remark = cols.slice(2).join(',') || ''
        if (ip_address) {
          items.push({ source, ip_address, remark, _sourceLabel: sourceRaw, _line: i + 1 })
        }
      }
      if (items.length === 0) {
        toast.warning('未解析到有效数据')
        return
      }
      setImportData({ items, fileName: file.name })
    } catch (err) {
      toast.error('解析文件失败: ' + err.message)
    }
    e.target.value = ''
  }

  // 确认导入
  const handleImportConfirm = () => {
    if (!importData) return
    setImporting(true)
    const items = importData.items.map(({ source, ip_address, remark }) => ({ source, ip_address, remark }))
    axios.post('/api/public-ips/batch-import', { items })
      .then(res => {
        toast.success(res.data.message)
        setImportData(null)
        loadData()
      })
      .catch(err => toast.error('导入失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setImporting(false))
  }

  // 导出Excel
  const SOURCE_LABELS = { aliyun_eip: '阿里云·EIP', aliyun_slb: '阿里云·SLB', huawei: labelMap.huawei || '华为云', idc: labelMap.idc || 'IDC', office: labelMap.office || '居然大厦' }
  const handleExport = async () => {
    if (filtered.length === 0) {
      toast.warning('没有可导出的数据')
      return
    }
    try {
      const XLSX = await loadXLSX()
      const rows = filtered.map(ip => [
        SOURCE_LABELS[ip.source] || ip.source,
        ip.account_name || '-',
        ip.ip_address,
        ip.instance_name || '-',
        ip.detail || '-',
        ip.region || '-',
        ip.remark || '-',
      ])
      const wsData = [['来源', '账号', 'IP地址', '实例名称', '详情', '区域', '备注'], ...rows]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 20 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '公网IP')
      XLSX.writeFile(wb, `公网大全_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      toast.error('导出失败')
    }
  }

  const handleReset = () => {
    setKeyword('')
    setSourceFilter('')
    setAccountFilter('')
  }

  // 筛选
  const filtered = allIPs.filter(ip => {
    if (sourceFilter && sourceFilter === 'aliyun') {
      if (ip.source !== 'aliyun_eip' && ip.source !== 'aliyun_slb') return false
    } else if (sourceFilter && ip.source !== sourceFilter) return false
    if (accountFilter && String(ip.account_id) !== accountFilter) return false
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      if (!(ip.ip_address || '').toLowerCase().includes(kw) &&
          !(ip.account_name || '').toLowerCase().includes(kw) &&
          !(ip.instance_name || '').toLowerCase().includes(kw) &&
          !(ip.remark || '').toLowerCase().includes(kw)) return false
    }
    return true
  })

  // 排序
  const sorted = sortData(filtered)

  // 统计
  const stats = {
    total: allIPs.length,
    aliyun: allIPs.filter(i => i.source === 'aliyun_eip' || i.source === 'aliyun_slb').length,
    ...Object.fromEntries(sourceLabels.map(s => [s.source, allIPs.filter(i => i.source === s.source).length])),
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>公网大全</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-refresh" onClick={loadData} disabled={loading}>
            {loading ? '刷新中..' : '刷新'}
          </button>
          <button className="btn-default" onClick={handleDownloadTemplate}>下载Excel模板</button>
          <button className="btn-default" onClick={() => importFileRef.current?.click()}>导入Excel</button>
          <button className="btn-default" onClick={handleExport}>导出Excel</button>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileSelect} />
          <button className="btn-default" onClick={openLabelSettings}>来源设置</button>
          <button className="btn-primary" onClick={handleAdd}>添加IP</button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="search-bar" style={{ marginBottom: 12 }}>
        <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder="搜索IP/账号/实例/备注" />
        <button className="btn-default" onClick={handleReset}>重置</button>
      </div>

      {/* 统计卡片 */}
      <div className="resource-tabs" style={{ marginBottom: 18 }}>
        {[
          { key: '', label: '全部', count: stats.total },
          { key: 'aliyun', label: '阿里云', count: stats.aliyun },
          ...sourceLabels.map(s => ({ key: s.source, label: s.label, count: stats[s.source] || 0 })),
        ].map(item => (
          <div key={item.key}
            className={`resource-tab${sourceFilter === item.key ? ' active' : ''}`}
            onClick={() => setSourceFilter(item.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {item.label}
            <span style={{ fontSize: 12, background: sourceFilter === item.key ? 'rgba(99,102,241,0.1)' : '#f1f5f9', color: sourceFilter === item.key ? '#6366f1' : '#94a3b8', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{item.count}</span>
          </div>
        ))}
      </div>

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="section-block form-section" style={{ marginBottom: 16 }}>
          <h3>{editingIP ? '编辑IP' : '添加公网IP'}</h3>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-item">
              <label>来源 <span className="required">*</span></label>
              <select value={formData.source} onChange={e => setFormData(prev => ({ ...prev, source: e.target.value }))}>
                {sourceLabels.map(s => <option key={s.source} value={s.source}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-item">
              <label>IP地址 <span className="required">*</span></label>
              {editingIP ? (
                <input type="text" value={formData.ip_address} onChange={e => setFormData(prev => ({ ...prev, ip_address: e.target.value }))} placeholder="请输入公网IP地址" />
              ) : (
                <textarea value={formData.ip_address} onChange={e => setFormData(prev => ({ ...prev, ip_address: e.target.value }))} placeholder="支持多个IP，每行一个，或用逗号/空格分隔" rows={3} style={{ resize: 'vertical' }} />
              )}
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

      {/* 表格 */}
      {sorted.length === 0 ? (
        <div className="empty-state">{loading ? '加载中...' : '暂无数据'}</div>
      ) : (
        <div className="overview-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  { key: 'source_label', label: '来源' },
                  { key: 'account_name', label: '账号' },
                  { key: 'ip_address', label: 'IP地址' },
                  { key: 'instance_name', label: '实例名称' },
                  { key: 'detail', label: '详情' },
                  { key: 'region', label: '区域' },
                  { key: 'remark', label: '备注' },
                ].map(col => (
                  <th key={col.key} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort(col.key)}>
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(ip => {
                const sc = SOURCE_COLORS[ip.source] || { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }
                const isManual = ['huawei', 'idc', 'office'].includes(ip.source)
                return (
                  <tr key={ip.id ? `m-${ip.id}` : `${ip.source}-${ip.ip_address}-${ip.instance_id}`}>
                    <td>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap' }}>
                        {ip.source === 'aliyun_eip' || ip.source === 'aliyun_slb' ? `阿里云·${ip.source === 'aliyun_eip' ? 'EIP' : 'SLB'}` : ip.source_label}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{keyword ? highlightKeyword(ip.account_name || '-', keyword) : (ip.account_name || '-')}</td>
                    <td className="td-mono" style={{ fontWeight: 500 }}>{keyword ? highlightKeyword(ip.ip_address, keyword) : ip.ip_address}</td>
                    <td>{keyword ? highlightKeyword(ip.instance_name || '-', keyword) : (ip.instance_name || '-')}</td>
                    <td>{keyword ? highlightKeyword(ip.detail || '-', keyword) : (ip.detail || '-')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{keyword ? highlightKeyword(REGION_LABELS[ip.region] || ip.region || '-', keyword) : (REGION_LABELS[ip.region] || ip.region || '-')}</td>
                    <td>{keyword ? highlightKeyword(ip.remark || '-', keyword) : (ip.remark || '-')}</td>
                    <td className="td-actions">
                      {isManual ? (
                        <>
                          <button className="btn-link" onClick={() => handleEdit(ip)}>编辑</button>
                          <button className="btn-link btn-danger-link" onClick={() => handleDelete(ip)}>删除</button>
                        </>
                      ) : (
                        <span>自动同步</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirmNode}
      {showLabelSettings && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 460, textAlign: 'left' }}>
            <h3 style={{ margin: '0 0 8px' }}>来源名称设置</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px' }}>自定义来源显示名称，删除来源将同时删除关联的公网IP</p>
            {editLabels.map((item, idx) => (
              <div key={item.source} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 80, fontSize: 13, color: '#64748b', flexShrink: 0 }}>{item.source}</span>
                <input
                  type="text"
                  value={item.label}
                  onChange={e => {
                    const next = [...editLabels]
                    next[idx] = { ...next[idx], label: e.target.value }
                    setEditLabels(next)
                  }}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
                />
                <button className="btn-link btn-danger-link" onClick={() => {
                  if (editLabels.length <= 1) { toast.warning('至少保留一个来源'); return }
                  setEditLabels(editLabels.filter((_, i) => i !== idx))
                }} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>删除</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input type="text" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="输入来源标识（英文）" style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
              <button className="btn-link" onClick={() => {
                if (!newSourceName.trim()) { toast.warning('请输入来源标识'); return }
                const key = newSourceName.trim().toLowerCase()
                if (editLabels.some(s => s.source === key)) { toast.warning('该来源已存在'); return }
                setEditLabels([...editLabels, { source: key, label: newSourceName.trim() }])
                setNewSourceName('')
              }}>+ 新增来源</button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-default" onClick={() => setShowLabelSettings(false)}>取消</button>
              <button className="btn-primary" onClick={saveLabels}>保存</button>
            </div>
          </div>
        </div>
      )}
      {importData && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <h3 style={{ margin: '0 0 8px' }}>导入预览 — {importData.fileName}</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>共解析 {importData.items.length} 条数据，请确认后导入</p>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16 }}>
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>来源</th>
                    <th>IP地址</th>
                    <th>备注</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item._line}</td>
                      <td>{item._sourceLabel || item.source}</td>
                      <td className="td-mono">{item.ip_address}</td>
                      <td>{item.remark || '-'}</td>
                      <td>{item.source ? <span style={{ color: '#16a34a' }}>✓</span> : <span style={{ color: '#ef4444' }}>来源无效</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-default" onClick={() => setImportData(null)}>取消</button>
              <button className="btn-primary" onClick={handleImportConfirm} disabled={importing}>
                {importing ? '导入中..' : `确认导入 (${importData.items.length}条)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 账单管理页面 ====================
function BillManagement() {
  const [billingCycle, setBillingCycle] = useState('')
  const [availableCycles, setAvailableCycles] = useState([])
  const [bills, setBills] = useState([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalPaid, setTotalPaid] = useState(0)
  const [totalUnpaid, setTotalUnpaid] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  const [prevMonthData, setPrevMonthData] = useState({ total: 0, accounts: {}, accountDetails: {} })
  // 年度汇总
  const [yearlyView, setYearlyView] = useState(false)
  const [yearlyYear, setYearlyYear] = useState(new Date().getFullYear().toString())
  const [yearlyData, setYearlyData] = useState({ yearly_bills: [], monthly_trend: [], total_yearly: 0, available_years: [] })
  const [yearlySort, setYearlySort] = useState({ key: '', dir: 'asc' })
  const [billsSort, setBillsSort] = useState({ key: '', dir: 'asc' })
  const [detailSort, setDetailSort] = useState({ key: '', dir: 'asc' })
  const [hideZeroBills, setHideZeroBills] = useState(false)
  const [historySyncing, setHistorySyncing] = useState(false)
  const [historyStartMonth, setHistoryStartMonth] = useState('2026-01')
  const [historyMonthPickerOpen, setHistoryMonthPickerOpen] = useState(false)
  const [historyPickerYear, setHistoryPickerYear] = useState(() => new Date().getFullYear())
  const [historyPickerTemp, setHistoryPickerTemp] = useState('')
  const historyMonthPickerRef = useRef(null)
  const [cyclePickerOpen, setCyclePickerOpen] = useState(false)
  const [cyclePickerYear, setCyclePickerYear] = useState(() => new Date().getFullYear())
  const [cyclePickerTemp, setCyclePickerTemp] = useState('')
  const cyclePickerRef = useRef(null)
  const { showConfirm, confirmNode } = useConfirm()

  // 同步历史账单
  const syncHistoryBills = async () => {
    if (historySyncing) return
    if (!historyStartMonth) {
      toast.warning('请选择同步开始月份')
      return
    }
    const ok = await showConfirm(`将从 ${historyStartMonth} 开始同步到当前月份的所有账单，可能需要几分钟，确定继续？`)
    if (!ok) return
    setHistorySyncing(true)
    try {
      // 获取所有账号
      const acctRes = await axios.get('/api/accounts')
      const accounts = acctRes.data || []
      const tasks = []
      for (const acct of accounts) {
        const res = await axios.post(`/api/accounts/${acct.id}/sync-history-bills`, { start_month: historyStartMonth })
        if (res.data.success) {
          tasks.push({ account_id: acct.id, name: acct.name, task_id: res.data.task_id })
        }
      }
      // 轮询等待所有任务完成
      let allDone = false
      while (!allDone) {
        await new Promise(r => setTimeout(r, 3000))
        allDone = true
        for (const task of tasks) {
          const statusRes = await axios.get(`/api/sync-status/${task.task_id}`)
          const status = statusRes.data
          if (status.status === 'running' || status.status === 'pending') {
            allDone = false
          }
        }
      }
      // 汇总结果
      const results = []
      for (const task of tasks) {
        const statusRes = await axios.get(`/api/sync-status/${task.task_id}`)
        results.push({ name: task.name, ...statusRes.data })
      }
      const successCount = results.filter(r => r.status === 'done').length
      toast.success(`历史账单同步完成，成功: ${successCount}/${results.length} 个账号`)
      // 刷新数据
      loadData()
    } catch (err) {
      toast.error('同步失败: ' + (err.response?.data?.message || err.message))
    } finally {
      setHistorySyncing(false)
    }
  }

  // 点击外部关闭月份选择器
  useEffect(() => {
    if (!historyMonthPickerOpen) return
    const handleClick = (e) => {
      if (historyMonthPickerRef.current && !historyMonthPickerRef.current.contains(e.target)) {
        setHistoryMonthPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [historyMonthPickerOpen])

  // 点击外部关闭账单月份选择器
  useEffect(() => {
    if (!cyclePickerOpen) return
    const handleClick = (e) => {
      if (cyclePickerRef.current && !cyclePickerRef.current.contains(e.target)) {
        setCyclePickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cyclePickerOpen])

  const loadData = useCallback((cycle) => {
    setLoading(true)
    const targetCycle = cycle || billingCycle
    // 计算上月
    const [y, m] = targetCycle.split('-').map(Number)
    const prevDate = new Date(y, m - 2, 1)
    const prevCycle = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    
    Promise.all([
      axios.get('/api/bills', { params: { billing_cycle: targetCycle } }),
      axios.get('/api/bills', { params: { billing_cycle: prevCycle } })
    ])
      .then(([currRes, prevRes]) => {
        setBills(currRes.data.bills)
        setTotalAmount(currRes.data.total_amount)
        setTotalPaid(currRes.data.total_paid || 0)
        setTotalUnpaid(currRes.data.total_unpaid || 0)
        setAvailableCycles(currRes.data.available_cycles)
        // 保存上月数据（明细汇总已由后端计算）
        const prevAccounts = {}
        ;(prevRes.data.bills || []).forEach(b => {
          prevAccounts[b.account_id] = b.total_amount
        })
        setPrevMonthData({
          total: prevRes.data.total_amount || 0,
          accounts: prevAccounts,
          accountDetails: prevRes.data.account_details_summary || {}
        })
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

  const [billDetails, setBillDetails] = useState({})

  const showBillDetail = (bill) => {
    if (selectedBill && selectedBill.account_id === bill.account_id) {
      setSelectedBill(null)
      return
    }
    setSelectedBill(bill)
    // 如果还没有加载过该账号的明细，则从 API 加载
    const cacheKey = `${bill.account_id}_${bill.billing_cycle}`
    if (!billDetails[cacheKey]) {
      axios.get('/api/bills/details', { params: { account_id: bill.account_id, billing_cycle: bill.billing_cycle } })
        .then(res => setBillDetails(prev => ({ ...prev, [cacheKey]: res.data.details || [] })))
        .catch(() => setBillDetails(prev => ({ ...prev, [cacheKey]: [] })))
    }
  }

  const handleYearlySort = (key) => {
    setYearlySort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  const handleBillsSort = (key) => {
    setBillsSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  const handleDetailSort = (key) => {
    setDetailSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  const sortArrowFor = (sort, key) => {
    if (sort.key !== key) return ' ↕'
    return sort.dir === 'asc' ? ' ↑' : ' ↓'
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

  // 环比渲染
  const renderComparison = (current, prev, sym = '¥') => {
    if (!prev || prev === 0) {
      if (current > 0) return <span style={{ color: '#ef4444', whiteSpace: 'nowrap', fontWeight: 600 }}>↑ {sym}{fmtMoney(current)} (新增)</span>
      return <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>
    }
    const diff = current - prev
    const pct = ((diff / prev) * 100).toFixed(1)
    if (diff > 0) {
      return <span style={{ color: '#ef4444', whiteSpace: 'nowrap', fontWeight: 600 }}>↑ {sym}{fmtMoney(diff)} (+{pct}%)</span>
    } else if (diff < 0) {
      return <span style={{ color: '#10b981', whiteSpace: 'nowrap', fontWeight: 600 }}>↓ {sym}{fmtMoney(Math.abs(diff))} ({pct}%)</span>
    }
    return <span style={{ color: '#94a3b8', fontWeight: 600 }}>— 持平</span>
  }

  // 明细环比渲染
  const renderDetailComparison = (current, prev, sym = '¥') => {
    if (!prev || prev === 0) {
      if (current > 0) return <span style={{ color: '#ef4444', whiteSpace: 'nowrap' }}>↑ {sym}{fmtMoney(current)} (新增)</span>
      return <span style={{ color: '#94a3b8' }}>-</span>
    }
    const diff = current - prev
    const pct = ((diff / prev) * 100).toFixed(1)
    if (diff > 0) {
      return <span style={{ color: '#ef4444', whiteSpace: 'nowrap' }}>↑ {sym}{fmtMoney(diff)} (+{pct}%)</span>
    } else if (diff < 0) {
      return <span style={{ color: '#10b981', whiteSpace: 'nowrap' }}>↓ {sym}{fmtMoney(Math.abs(diff))} ({pct}%)</span>
    }
    return <span style={{ color: '#94a3b8' }}>— 持平</span>
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
      {/* 账单月份查询 */}
      <div className="section-block">
        <div className="search-bar" style={{ marginBottom: 12 }}>
          <label>账单月份：</label>
          <button
            type="button"
            className="btn-default"
            style={{ minWidth: 90, textAlign: 'left' }}
            onClick={() => {
              setCyclePickerTemp(billingCycle)
              if (billingCycle) {
                const [y] = billingCycle.split('-')
                setCyclePickerYear(parseInt(y))
              }
              setCyclePickerOpen(true)
            }}
          >{billingCycle || '选择月份'}</button>
          <button className="btn-primary" onClick={() => loadData()} disabled={loading}>
            {loading ? '查询中..' : '查询'}
          </button>
          <button className="btn-default" onClick={() => syncHistoryBills()} disabled={historySyncing} style={{ marginLeft: 'auto' }}>
            {historySyncing ? '同步中...' : '同步历史账单'}
          </button>
          <label style={{ marginLeft: '12px' }}>从：</label>
          <button
            type="button"
            className="btn-default"
            style={{ minWidth: 90, textAlign: 'left' }}
            onClick={() => {
              setHistoryPickerTemp(historyStartMonth)
              if (historyStartMonth) {
                const [y] = historyStartMonth.split('-')
                setHistoryPickerYear(parseInt(y))
              }
              setHistoryMonthPickerOpen(true)
            }}
          >{historyStartMonth || '选择月份'}</button>
          <span style={{ color: '#64748b', fontSize: 13 }}>开始同步</span>
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

      {/* 汇总卡片 */}
      <div className="summary-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="summary-card highlight">
          <div className="card-label">{billingCycle} 消费总额</div>
          <div className="card-value">¥{fmtMoney(totalAmount)}</div>
          <div className="card-trend">环比上月 {renderComparison(totalAmount, prevMonthData.total)}</div>
        </div>
        <div className="summary-card highlight success">
          <div className="card-label">{billingCycle} 已还款总额</div>
          <div className="card-value">¥{fmtMoney(totalPaid)}</div>
        </div>
        <div className="summary-card warning">
          <div className="card-label">{billingCycle} 待还款总额</div>
          <div className="card-value">¥{fmtMoney(totalUnpaid)}</div>
        </div>
      </div>

      {/* 各账号账单*/}
      <div className="section-block">
        <h3 style={{ fontWeight: 500 }}>各账号账单</h3>
        {bills.length === 0 ? (
          <div className="empty-state">暂无账单数据，请先同步数据</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleBillsSort('account_name')}>账号名称{sortArrowFor(billsSort, 'account_name')}</th>
                  <th>账单月份</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleBillsSort('total_amount')}>消费总额{sortArrowFor(billsSort, 'total_amount')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleBillsSort('trend')}>环比上月{sortArrowFor(billsSort, 'trend')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleBillsSort('paid_amount')}>已还款金额{sortArrowFor(billsSort, 'paid_amount')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleBillsSort('unpaid_amount')}>待还款金额{sortArrowFor(billsSort, 'unpaid_amount')}</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 为每个bill添加trend字段用于排序
                  const billsWithTrend = bills.map(bill => ({
                    ...bill,
                    trend: bill.total_amount - (prevMonthData.accounts[bill.account_id] || 0)
                  }))
                  return getSorted(billsWithTrend, billsSort).map(bill => {
                    const sym = bill.currency === 'SGD' ? 'SGD ' : '¥'
                    const isPaidOff = (bill.unpaid_amount || 0) === 0
                    const amountColor = isPaidOff ? '#10b981' : 'inherit'
                    return (
                  <Fragment key={bill.account_id}>
                    <tr>
                      <td>{bill.account_name}</td>
                      <td>{bill.billing_cycle}</td>
                      <td className="td-amount" style={{ color: amountColor }}>{sym}{fmtMoney(bill.total_amount)}</td>
                      <td>{renderComparison(bill.total_amount, prevMonthData.accounts[bill.account_id], sym)}</td>
                      <td className="td-amount" style={{ color: amountColor }}>{sym}{fmtMoney(bill.paid_amount || 0)}</td>
                      <td className="td-amount" style={{ color: amountColor }}>{sym}{fmtMoney(bill.unpaid_amount || 0)}</td>
                      <td>{fmtDate(bill.updated_at)}</td>
                      <td>
                        <button className="btn-link" onClick={() => showBillDetail(bill)}>
                          {selectedBill && selectedBill.account_id === bill.account_id ? '收起' : '查看明细'}
                        </button>
                      </td>
                    </tr>
                    {selectedBill && selectedBill.account_id === bill.account_id && (() => {
                      const cacheKey = `${bill.account_id}_${bill.billing_cycle}`
                      const details = billDetails[cacheKey]
                      if (!details) return <tr key={`detail-${bill.account_id}`}><td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>加载中...</td></tr>
                      if (details.length === 0) return null
                      // 按产品类型+产品明细合并
                      const merged = {}
                      details.forEach(d => {
                        const code = d.product_code || d.product_type || 'other'
                        const detail = d.product_detail || d.product_type || '-'
                        const key = `${code}__${detail}`
                        if (!merged[key]) {
                          merged[key] = {
                            product_code: d.product_code || '-',
                            product_detail: detail,
                            after_tax_amount: 0,
                            cash_amount: 0,
                            deduct_amount: 0,
                          }
                        }
                        merged[key].after_tax_amount += parseFloat(d.after_tax_amount || d.pretax_amount || 0)
                        merged[key].cash_amount += parseFloat(d.cash_amount || 0)
                        merged[key].deduct_amount += parseFloat(d.deduct_amount || 0)
                      })
                      const mergedList = Object.values(merged)
                      // 获取上月该账号的明细
                      const prevDetails = prevMonthData.accountDetails[bill.account_id] || {}
                      // 过滤0金额
                      const displayList = hideZeroBills ? mergedList.filter(d => d.after_tax_amount !== 0) : mergedList
                      return (
                      <tr key={`detail-${bill.account_id}`}>
                        <td colSpan="7" style={{ padding: 0 }}>
                          <div className="bill-detail-panel">
                            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#64748b' }}>
                                <input type="checkbox" checked={hideZeroBills} onChange={e => setHideZeroBills(e.target.checked)} style={{ cursor: 'pointer' }} />
                                隐藏0金额项
                              </label>
                              {hideZeroBills && <span style={{ color: '#9ca3af' }}>({displayList.length}/{mergedList.length})</span>}
                            </div>
                            <table className="data-table inner-table">
                              <thead>
                                <tr>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDetailSort('product_code')}>产品类型{sortArrowFor(detailSort, 'product_code')}</th>
                                  <th>产品明细</th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDetailSort('after_tax_amount')}>应付金额{sortArrowFor(detailSort, 'after_tax_amount')}</th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDetailSort('trend')}>环比上月{sortArrowFor(detailSort, 'trend')}</th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDetailSort('cash_amount')}>现金支付额{sortArrowFor(detailSort, 'cash_amount')}</th>
                                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDetailSort('deduct_amount')}>代金券抵扣{sortArrowFor(detailSort, 'deduct_amount')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {displayList.length === 0 ? (
                                  <tr><td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>所有产品金额均为0，已隐藏</td></tr>
                                ) : (() => {
                                  // 为每个item 添加trend字段用于排序
                                  const listWithTrend = displayList.map(d => {
                                    const code = d.product_code || '-'
                                    const detail = d.product_detail || '-'
                                    const key = `${code}__${detail}`
                                    const prevItem = prevDetails[key]
                                    const prevAmount = prevItem ? (prevItem.after_tax_amount || prevItem.pretax_amount) : 0
                                    return { ...d, trend: d.after_tax_amount - prevAmount }
                                  })
                                  return getSorted(listWithTrend, detailSort).map((d, i) => {
                                    const code = d.product_code || '-'
                                    const detail = d.product_detail || '-'
                                    const key = `${code}__${detail}`
                                    const prevItem = prevDetails[key]
                                    const prevAmount = prevItem ? (prevItem.after_tax_amount || prevItem.pretax_amount) : 0
                                    return (
                                    <tr key={i}>
                                      <td style={{ fontSize: 14 }}>{d.product_code}</td>
                                      <td style={{ fontSize: 14 }}>{d.product_detail}</td>
                                      <td className="td-amount">{sym}{fmtMoney(d.after_tax_amount)}</td>
                                      <td>{renderDetailComparison(d.after_tax_amount, prevAmount, sym)}</td>
                                      <td className="td-amount">{sym}{fmtMoney(d.cash_amount)}</td>
                                      <td className="td-amount">{sym}{fmtMoney(d.deduct_amount)}</td>
                                    </tr>
                                    )
                                  })
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                      )
                    })()}
                  </Fragment>
                    )
                  })
                })()}
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

      <div className="summary-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="summary-card highlight">
          <div className="card-label">{yearlyYear}年消费总额</div>
          <div className="card-value">¥{fmtMoney(yearlyData.total_yearly)}</div>
        </div>
        <div className="summary-card highlight success">
          <div className="card-label">{yearlyYear}年已还款总额</div>
          <div className="card-value">¥{fmtMoney(yearlyData.total_yearly_paid || 0)}</div>
        </div>
        <div className="summary-card warning">
          <div className="card-label">{yearlyYear}年待还款总额</div>
          <div className="card-value">¥{fmtMoney(yearlyData.total_yearly_unpaid || 0)}</div>
        </div>
      </div>

      {/* 月度趋势图表 */}
      {yearlyData.monthly_trend.length > 0 && (() => {
        const maxAmount = Math.max(...yearlyData.monthly_trend.map(m => m.total_amount), 1)
        return (
          <div className="section-block">
            <h3>{yearlyYear}年月度消费趋势</h3>
            <div className="bar-chart">
              {yearlyData.monthly_trend.map((m, idx) => {
                const pct = Math.max((m.total_amount / maxAmount) * 100, 2)
                const month = parseInt(m.billing_cycle.split('-')[1])
                // 计算环比上月
                let trendText = ''
                let trendClass = ''
                if (idx > 0) {
                  const prevAmount = yearlyData.monthly_trend[idx - 1].total_amount
                  if (prevAmount > 0) {
                    const change = ((m.total_amount - prevAmount) / prevAmount * 100).toFixed(1)
                    if (change > 0) {
                      trendText = `↑${change}%`
                      trendClass = 'trend-up'
                    } else if (change < 0) {
                      trendText = `↓${Math.abs(change)}%`
                      trendClass = 'trend-down'
                    } else {
                      trendText = '—'
                      trendClass = 'trend-flat'
                    }
                  }
                }
                return (
                  <div key={m.billing_cycle} className="bar-col">
                    {trendText && <div className={`bar-trend ${trendClass}`}>{trendText}</div>}
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleYearlySort('account_name')}>账号名称{sortArrowFor(yearlySort, 'account_name')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleYearlySort('yearly_amount')}>年消费总额{sortArrowFor(yearlySort, 'yearly_amount')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleYearlySort('yearly_paid')}>已还款金额{sortArrowFor(yearlySort, 'yearly_paid')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleYearlySort('yearly_unpaid')}>待还款金额{sortArrowFor(yearlySort, 'yearly_unpaid')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} className="td-center" onClick={() => handleYearlySort('months_count')}>账单月数{sortArrowFor(yearlySort, 'months_count')}</th>
                </tr>
              </thead>
              <tbody>
                {getSorted(yearlyData.yearly_bills, yearlySort).map(bill => {
                  const sym = bill.currency === 'SGD' ? 'SGD ' : '¥'
                  const isPaidOff = (bill.yearly_unpaid || 0) === 0
                  const amountColor = isPaidOff ? '#10b981' : 'inherit'
                  return (
                  <tr key={bill.account_id}>
                    <td>{bill.account_name}</td>
                    <td className="td-amount" style={{ color: amountColor }}>{sym}{fmtMoney(bill.yearly_amount)}</td>
                    <td className="td-amount" style={{ color: amountColor }}>{sym}{fmtMoney(bill.yearly_paid || 0)}</td>
                    <td className="td-amount" style={{ color: amountColor }}>{sym}{fmtMoney(bill.yearly_unpaid || 0)}</td>
                    <td className="td-center">{bill.months_count}个月</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}
      {/* 颜色说明 */}
      <div style={{ marginTop: 16, padding: '10px 16px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#64748b', lineHeight: 2 }}>
        <span>金额颜色：</span>
        <span style={{ marginRight: 12 }}><span style={{ color: '#10b981', fontWeight: 500 }}>绿色</span> = 已全部还清</span>
        <span style={{ marginRight: 24 }}><span style={{ color: '#0f172a', fontWeight: 500 }}>黑色</span> = 仍有待还款</span>
        <span>环比上月：</span>
        <span style={{ marginRight: 12 }}><span style={{ color: '#ef4444', fontWeight: 500 }}>红色↑</span> = 消费上涨</span>
        <span style={{ marginRight: 12 }}><span style={{ color: '#10b981', fontWeight: 500 }}>绿色↓</span> = 消费下降</span>
        <span><span style={{ color: '#94a3b8', fontWeight: 500 }}>灰色—</span> = 消费持平</span>
      </div>

      {/* 账单月份选择弹窗 */}
      <MonthPickerModal
        open={cyclePickerOpen}
        onClose={() => setCyclePickerOpen(false)}
        title="选择账单月份"
        year={cyclePickerYear}
        onYearChange={setCyclePickerYear}
        value={cyclePickerTemp}
        onChange={setCyclePickerTemp}
        statusText={cyclePickerTemp ? `已选：${cyclePickerTemp}` : '未选择月份'}
        onConfirm={() => {
          if (cyclePickerTemp) handleCycleChange(cyclePickerTemp)
          setCyclePickerOpen(false)
        }}
      />

      {/* 历史账单起始月份选择弹窗 */}
      <MonthPickerModal
        open={historyMonthPickerOpen}
        onClose={() => setHistoryMonthPickerOpen(false)}
        title="选择同步起始月份"
        year={historyPickerYear}
        onYearChange={setHistoryPickerYear}
        value={historyPickerTemp}
        onChange={setHistoryPickerTemp}
        statusText={historyPickerTemp ? `已选：${historyPickerTemp}` : '未选择月份'}
        onConfirm={() => {
          setHistoryStartMonth(historyPickerTemp)
          setHistoryMonthPickerOpen(false)
        }}
      />

      {confirmNode}
    </div>
  )
}

// ==================== 网址大全页面 ====================
function WebLinksManagement() {
  const toast = useToast()
  const searchFilterCtx = useContext(SearchFilterContext)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [formData, setFormData] = useState({ name: '', url: '', description: '', category: '', sort_order: 0 })
  const [categoryFilter, setCategoryFilter] = useState('')
  const [keyword, setKeyword] = useState(() => {
    const filter = searchFilterCtx?.searchFilter
    if (filter && filter.keyword) return filter.keyword
    return ''
  })
  const [categoryOrder, setCategoryOrder] = useState([])
  const { showConfirm, confirmNode } = useConfirm()
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  // 重命名分类：更新该分类下所有网址的 category 字段
  const handleRenameCategory = async (oldName) => {
    const newName = editingCategoryName.trim()
    if (!newName || newName === oldName) {
      setEditingCategory(null)
      return
    }
    const itemsInCategory = links.filter(l => (l.category || '') === oldName)
    try {
      await Promise.all(itemsInCategory.map(item =>
        axios.put(`/api/web-links/${item.id}`, { name: item.name, url: item.url, description: item.description || '', category: newName, sort_order: item.sort_order || 0 })
      ))
      setLinks(prev => prev.map(l => (l.category || '') === oldName ? { ...l, category: newName } : l))
      // 同步更新分类排序顺序
      setCategoryOrder(prev => prev.map(c => c === oldName ? newName : c))
      toast.success(`分类已重命名为“${newName}”`)
    } catch (err) {
      toast.error('重命名失败: ' + (err.response?.data?.error || err.message))
    }
    setEditingCategory(null)
  }

  // 清除搜索过滤状态（已消费）
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.keyword) {
      searchFilterCtx.setSearchFilter(null)
    }
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    axios.get('/api/web-links')
      .then(res => {
        if (res.data.success) setLinks(res.data.links)
        else toast.error(res.data.error || '加载失败')
      })
      .catch(err => toast.error('加载失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 获取所有分类
  const hasUncategorized = links.some(l => !l.category)
  const categories = [
    ...new Set(links.map(l => l.category).filter(c => c)),
    ...(hasUncategorized ? ['未分类'] : [])
  ]

  // 从后端加载分类顺序
  useEffect(() => {
    axios.get('/api/web-links/category-order')
      .then(res => {
        if (res.data.order) setCategoryOrder(res.data.order)
      })
      .catch(() => {})
  }, [])

  // 保存分类顺序到后端
  useEffect(() => {
    if (categoryOrder.length > 0) {
      axios.put('/api/web-links/category-order', { order: categoryOrder }).catch(() => {})
    }
  }, [categoryOrder])

  // 移动分类
  const moveCategory = (cat, direction) => {
    const sortedCats = getSortedCategories()
    const idx = sortedCats.indexOf(cat)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= sortedCats.length) return
    const newOrder = [...sortedCats]
    ;[newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]]
    setCategoryOrder(newOrder)
  }

  // 获取排序后的分类列表
  const getSortedCategories = () => {
    const cats = [...categories]
    // 按 categoryOrder 排序
    return cats.sort((a, b) => {
      const idxA = categoryOrder.indexOf(a)
      const idxB = categoryOrder.indexOf(b)
      // 如果都不在 order 中，按字母排序
      if (idxA === -1 && idxB === -1) return a.localeCompare(b)
      // 如果只有一个在 order 中，在 order 中的排前面
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }

  // 过滤后的链接
  const filteredLinks = links.filter(l => {
    if (categoryFilter && l.category !== categoryFilter) return false
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      return (l.name || '').toLowerCase().includes(kw)
        || (l.url || '').toLowerCase().includes(kw)
        || (l.description || '').toLowerCase().includes(kw)
        || (l.category || '').toLowerCase().includes(kw)
    }
    return true
  })

  // 按分类分组
  const groupedLinks = filteredLinks.reduce((acc, link) => {
    const cat = link.category || '未分类'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(link)
    return acc
  }, {})

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.warning('请填写名称和网址')
      return
    }
    const data = { ...formData, sort_order: parseInt(formData.sort_order) || 0 }
    if (editingLink) {
      axios.put(`/api/web-links/${editingLink.id}`, data)
        .then(() => {
          toast.success('网址更新成功')
          setShowForm(false)
          loadData()
        })
        .catch(err => toast.error('更新失败: ' + (err.response?.data?.error || err.message)))
    } else {
      axios.post('/api/web-links', data)
        .then(() => {
          toast.success('网址创建成功')
          setShowForm(false)
          loadData()
        })
        .catch(err => toast.error('创建失败: ' + (err.response?.data?.error || err.message)))
    }
  }

  const handleEdit = (link) => {
    setFormData({ name: link.name, url: link.url, description: link.description || '', category: link.category || '', sort_order: link.sort_order || 0 })
    setEditingLink(link)
    setShowForm(true)
  }

  const handleDelete = async (link) => {
    const ok = await showConfirm(`确定要删除网址“${link.name}”吗？`)
    if (!ok) return
    axios.delete(`/api/web-links/${link.id}`)
      .then(() => {
        toast.success('网址已删除')
        loadData()
      })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }
  
  // 移动网址（调整排序）
  const handleMoveLink = (link, direction) => {
    const category = link.category || ''
    const itemsInCategory = links
      .filter(l => (l.category || '') === category)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
    const idx = itemsInCategory.findIndex(l => l.id === link.id)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= itemsInCategory.length) return
    // 重新分配连续排序值，然后交换两个相邻项
    const newOrder = [...itemsInCategory]
    ;[newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]]
    // 找出排序值实际变化的项
    const updates = []
    newOrder.forEach((item, i) => {
      const oldOrder = item.sort_order || 0
      if (oldOrder !== i) {
        updates.push({ id: item.id, name: item.name, url: item.url, description: item.description || '', category: item.category || '', sort_order: i })
      }
    })
    if (updates.length === 0) return
    Promise.all(updates.map(u => axios.put(`/api/web-links/${u.id}`, u)))
      .then(() => {
        setLinks(prevLinks => prevLinks.map(l => {
          const upd = updates.find(u => u.id === l.id)
          return upd ? { ...l, sort_order: upd.sort_order } : l
        }))
      })
      .catch(err => toast.error('移动失败: ' + (err.response?.data?.error || err.message)))
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>网址大全</h2>
      </div>

      <div className="search-bar">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">全部分类</option>
          {categories.map(c => (<option key={c} value={c}>{c}</option>))}
        </select>
        <input type="text" placeholder="搜索名称、网址、描述..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        <button className="btn-default" onClick={() => { setKeyword(''); setCategoryFilter('') }}>重置</button>
        <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setFormData({ name: '', url: '', description: '', category: '', sort_order: 0 }); setEditingLink(null); setShowForm(true) }}>添加网址</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditingLink(null) }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingLink ? '编辑网址' : '添加网址'}</h3>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditingLink(null) }}>×</button>
            </div>
            <div className="form-grid">
              <div className="form-item">
                <label>名称<span className="required">*</span></label>
                <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="请输入名称" />
              </div>
              <div className="form-item">
                <label>网址<span className="required">*</span></label>
                <input type="text" value={formData.url} onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))} placeholder="请输入网址（如：https://example.com）" />
              </div>
              <div className="form-item">
                <label>分类</label>
                <input type="text" list="category-list" value={formData.category} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))} placeholder="选择或输入分类（可选）" />
                <datalist id="category-list">
                  {categories.map(c => (<option key={c} value={c} />))}
                </datalist>
              </div>
              <div className="form-item">
                <label>排序</label>
                <input type="number" value={formData.sort_order} onChange={e => setFormData(prev => ({ ...prev, sort_order: e.target.value }))} placeholder="数字越小越靠前" />
              </div>
              <div className="form-item" style={{ gridColumn: '1 / -1' }}>
                <label>描述</label>
                <input type="text" value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="请输入描述（可选）" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-default" onClick={handleSubmit}>{editingLink ? '保存' : '创建'}</button>
              <button className="btn-default" onClick={() => { setShowForm(false); setEditingLink(null) }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : filteredLinks.length === 0 ? (
        <div className="empty-state">暂无数据，点击“添加网址”开始添加</div>
      ) : (
        getSortedCategories().map((category, idx, arr) => {
          const items = (groupedLinks[category] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          if (items.length === 0) return null
          return (
            <div key={category} className="section-block">
              <div className="category-header">
                {editingCategory === category ? (
                  <h3>
                    <input
                      type="text"
                      value={editingCategoryName}
                      onChange={e => setEditingCategoryName(e.target.value)}
                      onBlur={() => handleRenameCategory(category)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingCategory(null) }}
                      autoFocus
                      style={{ fontSize: 'inherit', fontWeight: 'inherit', width: '160px', padding: '2px 6px' }}
                    />
                  </h3>
                ) : (
                  <h3 onDoubleClick={() => { setEditingCategory(category); setEditingCategoryName(category) }}>
                    {category} <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 'normal' }}>({items.length})</span>
                  </h3>
                )}
                <div className="category-actions">
                  <button className="btn-link" onClick={() => { setEditingCategory(category); setEditingCategoryName(category) }} title="重命名">✎</button>
                  <button className="btn-link" onClick={() => moveCategory(category, 'up')} disabled={idx === 0} title="上移">↑</button>
                  <button className="btn-link" onClick={() => moveCategory(category, 'down')} disabled={idx === arr.length - 1} title="下移">↓</button>
                </div>
              </div>
              <div className="weblinks-grid">
                {items.map((link, linkIdx) => (
                  <div key={link.id} className="weblink-card">
                    <div className="weblink-header">
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="weblink-name">{link.name}</a>
                      <div className="weblink-actions">
                        <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); handleMoveLink(link, 'up') }} disabled={linkIdx === 0} title="上移">↑</button>
                        <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); handleMoveLink(link, 'down') }} disabled={linkIdx === items.length - 1} title="下移">↓</button>
                        <button type="button" className="btn-link" onClick={() => handleEdit(link)}>编辑</button>
                        <button type="button" className="btn-link" style={{ color: '#ef4444' }} onClick={() => handleDelete(link)}>删除</button>
                      </div>
                    </div>
                    <div className="weblink-url">{link.url}</div>
                    {link.description && <div className="weblink-desc">{link.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {confirmNode}
    </div>
  )
}

// ==================== 账号管理页面 ====================
function AccountManagement() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncingIds, setSyncingIds] = useState(() => {
    // 从 localStorage 恢复同步状态
    try {
      const saved = localStorage.getItem('syncingIds')
      return saved ? JSON.parse(saved) : {}
    } catch (err) { return {} }
  })
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [formData, setFormData] = useState({ name: '', access_key_id: '', access_key_secret: '', remark: '', balance_threshold: 20000, currency: 'CNY' })
  // 账单同步月份选择
  const [billSyncDialog, setBillSyncDialog] = useState(null) // { accountId, accountName }
  const [billSyncMonth, setBillSyncMonth] = useState('')
  const [billSyncYear, setBillSyncYear] = useState(() => new Date().getFullYear())
  // 账号表格排序
  const [acctSortKey, setAcctSortKey] = useState('')
  const [acctSortDir, setAcctSortDir] = useState('asc')
  const handleAcctSort = (key) => {
    if (acctSortKey === key) {
      setAcctSortDir(acctSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setAcctSortKey(key)
      setAcctSortDir('asc')
    }
  }
  const acctSortArrow = (key) => {
    if (acctSortKey !== key) return ' ↕'
    return acctSortDir === 'asc' ? ' ↑' : ' ↓'
  }
  // 自动同步配置
  const [autoSync, setAutoSync] = useState({ enabled: false, interval_hours: 6, last_sync_at: null })
  const [intervalDropdownOpen, setIntervalDropdownOpen] = useState(false)
  const intervalDropdownRef = useRef(null)
  // 默认区域配置
  const ALL_REGIONS = [
    { id: 'cn-hangzhou', name: '华东1（杭州）' },
    { id: 'cn-shanghai', name: '华东2（上海）' },
    { id: 'cn-nanjing', name: '华东5（南京）' },
    { id: 'cn-beijing', name: '华北2（北京）' },
    { id: 'cn-qingdao', name: '华北1（青岛）' },
    { id: 'cn-zhangjiakou', name: '华北3（张家口）' },
    { id: 'cn-huhehaote', name: '华北5（呼和浩特）' },
    { id: 'cn-wulanchabu', name: '华北6（乌兰察布）' },
    { id: 'cn-shenzhen', name: '华南1（深圳）' },
    { id: 'cn-heyuan', name: '华南2（河源）' },
    { id: 'cn-guangzhou', name: '华南3（广州）' },
    { id: 'cn-chengdu', name: '西南1（成都）' },
    { id: 'cn-hongkong', name: '中国香港' },
    { id: 'ap-southeast-1', name: '新加坡' },
    { id: 'ap-southeast-2', name: '悉尼' },
    { id: 'ap-southeast-3', name: '吉隆坡' },
    { id: 'ap-southeast-5', name: '雅加达' },
    { id: 'ap-southeast-6', name: '马尼拉' },
    { id: 'ap-southeast-7', name: '泰国（曼谷）' },
    { id: 'ap-northeast-1', name: '东京' },
    { id: 'ap-northeast-2', name: '韩国（首尔）' },
    { id: 'ap-south-1', name: '孟买' },
    { id: 'us-east-1', name: '美国（弗吉尼亚）' },
    { id: 'us-west-1', name: '美国（硅谷）' },
    { id: 'eu-west-1', name: '英国（伦敦）' },
    { id: 'eu-central-1', name: '德国（法兰克福）' },
    { id: 'me-east-1', name: '阿联酋（迪拜）' },
  ]
  const [defaultRegions, setDefaultRegions] = useState([])
  // 顶部同步下拉菜单
  const [showTopDropdown, setShowTopDropdown] = useState(false)
  // 确认弹框
  const { showConfirm, confirmNode } = useConfirm()

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

  // 恢复未完成的同步任务轮询
  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem('activeSyncTasks')
      if (savedTasks) {
        const tasks = JSON.parse(savedTasks)
        Object.entries(tasks).forEach(([accountId, taskId]) => {
          if (taskId) {
            pollSyncTask(taskId, (result) => {
              if (result) {
                toast.success(result.message || '同步完成')
                loadAccounts()
              }
              setSyncingIds(prev => {
                const next = { ...prev, [accountId]: false }
                // 清理 localStorage
                const savedIds = JSON.parse(localStorage.getItem('syncingIds') || '{}')
                delete savedIds[accountId]
                localStorage.setItem('syncingIds', JSON.stringify(savedIds))
                const savedActive = JSON.parse(localStorage.getItem('activeSyncTasks') || '{}')
                delete savedActive[accountId]
                localStorage.setItem('activeSyncTasks', JSON.stringify(savedActive))
                return next
              })
            })
          }
        })
      }
    } catch (err) { /* ignore */ }
  }, [])

  const loadAutoSync = useCallback(() => {
    axios.get('/api/auto-sync')
      .then(res => setAutoSync(res.data))
      .catch(err => console.error('加载自动同步配置失败:', err))
  }, [])

  useEffect(() => { loadAutoSync() }, [loadAutoSync])

  const loadDefaultRegions = useCallback(() => {
    axios.get('/api/default-regions')
      .then(res => setDefaultRegions(res.data.regions || []))
      .catch(err => console.error('加载默认区域失败:', err))
  }, [])

  useEffect(() => { loadDefaultRegions() }, [loadDefaultRegions])

  const handleToggleRegion = (regionId) => {
    const isChecked = defaultRegions.includes(regionId)
    let updatedRegions
    if (isChecked) {
      if (defaultRegions.length <= 1) {
        toast.warning('至少需要保留一个区域')
        return
      }
      updatedRegions = defaultRegions.filter(r => r !== regionId)
    } else {
      updatedRegions = [...defaultRegions, regionId]
    }
    axios.post('/api/default-regions', { regions: updatedRegions })
      .then(res => {
        setDefaultRegions(updatedRegions)
        toast.success(res.data.message)
      })
      .catch(err => toast.error('更新失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleAddAccount = () => {
    setFormData({ name: '', access_key_id: '', access_key_secret: '', remark: '', balance_threshold: 20000, currency: 'CNY' })
    setEditingAccount(null)
    setShowForm(true)
  }

  const handleEditAccount = (account) => {
    setFormData({ name: account.name, access_key_id: account.access_key_id, access_key_secret: '', remark: account.remark || '', balance_threshold: account.balance_threshold ?? 20000, currency: account.currency || 'CNY' })
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

  const handleSync = (accountId, syncType = 'all', billingMonth = null) => {
    const typeLabel = { all: '全部', resources: '资源', bills: '账单' }[syncType]
    setSyncingIds(prev => ({ ...prev, [accountId]: true }))
    // 保存到 localStorage
    const savedIds = JSON.parse(localStorage.getItem('syncingIds') || '{}')
    savedIds[accountId] = true
    localStorage.setItem('syncingIds', JSON.stringify(savedIds))
    const monthHint = billingMonth ? `（${billingMonth}）` : ''
    toast.info(`正在同步${typeLabel}${monthHint}...`)
    const payload = { sync_type: syncType }
    if (billingMonth) payload.billing_month = billingMonth
    axios.post(`/api/accounts/${accountId}/sync`, payload)
      .then(res => {
        if (res.data.task_id) {
          // 保存 task_id 到 localStorage
          const savedTasks = JSON.parse(localStorage.getItem('activeSyncTasks') || '{}')
          savedTasks[accountId] = res.data.task_id
          localStorage.setItem('activeSyncTasks', JSON.stringify(savedTasks))
          pollSyncTask(res.data.task_id, (result) => {
            if (result) {
              const msg = result.message || ''
              // 解析后端返回的消息，生成友好提示
              if (msg.includes('错误')) {
                toast.warning(`同步完成（部分失败）：${msg}`, 6000)
              } else {
                toast.success(`同步已完成！${msg}`, 4000)
              }
              loadAccounts()
            }
            setSyncingIds(prev => ({ ...prev, [accountId]: false }))
            // 清理 localStorage
            const cleanupIds = JSON.parse(localStorage.getItem('syncingIds') || '{}')
            delete cleanupIds[accountId]
            localStorage.setItem('syncingIds', JSON.stringify(cleanupIds))
            const cleanupTasks = JSON.parse(localStorage.getItem('activeSyncTasks') || '{}')
            delete cleanupTasks[accountId]
            localStorage.setItem('activeSyncTasks', JSON.stringify(cleanupTasks))
            // 记录手动同步完成时间
            localStorage.setItem('lastManualSyncAt', (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}` })())
          })
        } else {
          toast.success(res.data.message || '同步完成')
          setSyncingIds(prev => ({ ...prev, [accountId]: false }))
          const cleanupIds = JSON.parse(localStorage.getItem('syncingIds') || '{}')
          delete cleanupIds[accountId]
          localStorage.setItem('syncingIds', JSON.stringify(cleanupIds))
          // 记录手动同步完成时间
          localStorage.setItem('lastManualSyncAt', (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}` })())
        }
      })
      .catch(err => {
        const msg = err.response?.data?.message || err.message || '未知错误'
        toast.error(`同步${typeLabel}失败: ` + msg)
        setSyncingIds(prev => ({ ...prev, [accountId]: false }))
        const cleanupIds = JSON.parse(localStorage.getItem('syncingIds') || '{}')
        delete cleanupIds[accountId]
        localStorage.setItem('syncingIds', JSON.stringify(cleanupIds))
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
            // 记录手动同步完成时间
            localStorage.setItem('lastManualSyncAt', (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}` })())
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
        <h2>平台设置</h2>
      </div>

      {/* 自动同步配置 */}
      <div className="section-block auto-sync-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: 0, padding: 0, border: 'none' }}>自动同步</h3>
          <button className="btn-primary" onClick={() => handleSyncAll('all')} disabled={loading}>
            {loading ? '同步中..' : '同步全部'}
          </button>
        </div>
        <div className="auto-sync-content">
          <div className="auto-sync-status">
            <span className={`status-tag ${autoSync.enabled ? 'status-active' : 'status-inactive'}`}
              style={{ padding: '10px 16px', fontSize: 14, lineHeight: '1.5' }}>
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
            <span style={{ color: '#64748b', fontSize: 14 }}>每个整点自动同步</span>
          </div>
          {autoSync.last_sync_at && (
            <div className="auto-sync-last">
              上次自动同步：{fmtDate(autoSync.last_sync_at)}
            </div>
          )}
          {(() => {
            const lastManualSync = localStorage.getItem('lastManualSyncAt')
            if (lastManualSync) {
              return (
                <div className="auto-sync-last">
                  上次手动同步：{lastManualSync}
                </div>
              )
            }
            return null
          })()}
        </div>
      </div>

      {/* 默认区域配置 */}
      <div className="section-block">
        <h3>同步区域</h3>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 12 }}>勾选需要同步的区域，至少选择一个</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px 16px' }}>
          {ALL_REGIONS.map(region => (
            <label key={region.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
              background: defaultRegions.includes(region.id) ? '#eef2ff' : 'transparent',
              border: `1px solid ${defaultRegions.includes(region.id) ? '#c7d2fe' : '#e2e8f0'}`,
              transition: 'all 0.15s'
            }}>
              <input
                type="checkbox"
                checked={defaultRegions.includes(region.id)}
                onChange={() => handleToggleRegion(region.id)}
                style={{ margin: 0, accentColor: '#6366f1', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: '#334155', whiteSpace: 'nowrap' }}>
                {region.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 账号列表 */}
      <div className="section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: 0, padding: 0, border: 'none' }}>账号设置</h3>
          <button className="btn-primary" onClick={handleAddAccount}>添加账号</button>
        </div>

        {/* 添加/编辑表单 */}
        {showForm && (
          <div className="section-block form-section" style={{ marginBottom: 20 }}>
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
              <div className="form-item">
                <label>余额预警阈值</label>
                <input type="number" value={formData.balance_threshold} onChange={e => setFormData(prev => ({ ...prev, balance_threshold: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="默认 20000" min="0" />
              </div>
              <div className="form-item">
                <label>币种</label>
                <select value={formData.currency} onChange={e => setFormData(prev => ({ ...prev, currency: e.target.value }))}>
                  <option value="CNY">人民币（¥）</option>
                  <option value="SGD">新加坡元（SGD）</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={handleSubmit}>确定</button>
              <button className="btn-default" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="empty-state">暂无账号，请点击“添加账号”添加阿里云AccessKey</div>
        ) : (
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { key: 'name', label: '账号名称' },
                    { key: 'aliyun_account_id', label: '阿里云账号ID' },
                    { key: 'access_key_id', label: 'AccessKey ID' },
                    { key: 'remark', label: '备注' },
                    { key: 'balance_threshold', label: '预警阈值' },
                    { key: 'currency', label: '币种' },
                    { key: 'last_sync_at', label: '上次同步' },
                  ].map(col => (
                    <th
                      key={col.key}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleAcctSort(col.key)}
                    >
                      {col.label}{acctSortArrow(col.key)}
                    </th>
                  ))}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...accounts].sort((a, b) => {
                  let va = a[acctSortKey] ?? ''
                  let vb = b[acctSortKey] ?? ''
                  if (acctSortKey === 'balance_threshold') {
                    va = va ?? 20000
                    vb = vb ?? 20000
                    return acctSortDir === 'asc' ? va - vb : vb - va
                  }
                  if (typeof va === 'number' && typeof vb === 'number') {
                    return acctSortDir === 'asc' ? va - vb : vb - va
                  }
                  const sa = String(va), sb = String(vb)
                  return acctSortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
                }).map(acct => (
                  <tr key={acct.id}>
                    <td>{acct.name}</td>
                    <td className="td-mono">{acct.aliyun_account_id || '-'}</td>
                    <td className="td-mono">{acct.access_key_id}</td>
                    <td>{acct.remark || '-'}</td>
                    <td>{(acct.currency || 'CNY') === 'SGD' ? 'SGD ' : '¥'}{fmtMoney(acct.balance_threshold ?? 20000)}</td>
                    <td>{(acct.currency || 'CNY') === 'SGD' ? '新加坡元' : '人民币'}</td>
                    <td>{acct.last_sync_at ? fmtDate(acct.last_sync_at) : '从未同步'}</td>
                    <td className="td-actions">
                      <button className="btn-link" onClick={() => handleSync(acct.id, 'all')} disabled={syncingIds[acct.id]}>
                        {syncingIds[acct.id] ? '同步中..' : '同步全部'}
                      </button>
                      <button className="btn-link" onClick={() => handleSync(acct.id, 'resources')} disabled={syncingIds[acct.id]}>同步资源</button>
                      <button className="btn-link" onClick={() => { setBillSyncDialog({ accountId: acct.id, accountName: acct.name }); setBillSyncMonth('') }} disabled={syncingIds[acct.id]}>同步账单</button>
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

      {/* 账单同步月份选择弹窗 */}
      <MonthPickerModal
        open={!!billSyncDialog}
        onClose={() => setBillSyncDialog(null)}
        title={`同步账单 - ${billSyncDialog?.accountName || ''}`}
        year={billSyncYear}
        onYearChange={setBillSyncYear}
        value={billSyncMonth}
        onChange={setBillSyncMonth}
        statusText={billSyncMonth ? `已选：${billSyncMonth}` : '未选择，将同步当月账单'}
        confirmLabel="开始同步"
        onConfirm={() => {
          handleSync(billSyncDialog.accountId, 'bills', billSyncMonth || null)
          setBillSyncDialog(null)
        }}
      />

      {confirmNode}
    </div>
  )
}

// ==================== RAM 管理页面 ====================
function RamManagement() {
  const toast = useToast()
  const searchFilterCtx = useContext(SearchFilterContext)
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [ramUsers, setRamUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUser, setNewUser] = useState({ user_name: '', display_name: '', comments: '', account_id: '' })
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
  const [duplicatePolicyWarning, setDuplicatePolicyWarning] = useState('')
  // 重置密码
  const [resetPwdUser, setResetPwdUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetPwdLoading, setResetPwdLoading] = useState(false)
  // 用户搜索
  const [userKeyword, setUserKeyword] = useState('')
  // 用户排序
  const [userSortKey, setUserSortKey] = useState('create_date')
  const [userSortDir, setUserSortDir] = useState('desc')
  // 当前操作的用户所属账号
  const [currentUserAccountId, setCurrentUserAccountId] = useState(null)
  // 确认弹框
  const { showConfirm, confirmNode } = useConfirm()

  // 读取全局搜索过滤
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.type_key === 'ram') {
      const kw = searchFilterCtx.searchFilter.keyword
      if (kw) setUserKeyword(kw)
      searchFilterCtx.setSearchFilter(null)
    }
  }, [searchFilterCtx?.searchFilter])

  const filteredUsers = ramUsers.filter(u => {
    if (!userKeyword.trim()) return true
    const kw = userKeyword.trim().toLowerCase()
    return (u.user_name || '').toLowerCase().includes(kw)
      || (u.user_principal_name || '').toLowerCase().includes(kw)
      || (u.display_name || '').toLowerCase().includes(kw)
      || (u.comments || '').toLowerCase().includes(kw)
      || (u.access_keys || []).some(ak => ak.toLowerCase().includes(kw))
  }).sort((a, b) => {
    let va = a[userSortKey]
    let vb = b[userSortKey]
    // 特殊处理 AccessKey
    if (userSortKey === 'access_keys') {
      va = (a.access_keys && a.access_keys.length > 0) ? a.access_keys[0] : ''
      vb = (b.access_keys && b.access_keys.length > 0) ? b.access_keys[0] : ''
    }
    // 特殊处理日期
    if (userSortKey === 'create_date') {
      va = new Date(va || 0).getTime()
      vb = new Date(vb || 0).getTime()
      return userSortDir === 'asc' ? va - vb : vb - va
    }
    // 字符串比较
    va = (va || '').toString().toLowerCase()
    vb = (vb || '').toString().toLowerCase()
    if (va < vb) return userSortDir === 'asc' ? -1 : 1
    if (va > vb) return userSortDir === 'asc' ? 1 : -1
    return 0
  })

  const handleUserSort = (key) => {
    if (userSortKey === key) {
      setUserSortDir(userSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setUserSortKey(key)
      setUserSortDir('asc')
    }
  }

  const sortArrow = (key) => {
    if (userSortKey !== key) return ' ↕'
    return userSortDir === 'asc' ? ' ↑' : ' ↓'
  }

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
          // 按创建时间倒序排列
          allUsers.sort((a, b) => {
            const dateA = new Date(a.create_date || 0)
            const dateB = new Date(b.create_date || 0)
            return dateB - dateA
          })
          setRamUsers(allUsers)
        })
        .catch(err => toast.error('加载 RAM 用户失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    } else {
      axios.get(`/api/accounts/${selectedAccount}/ram/users`)
        .then(res => {
          if (res.data.success) {
            const users = res.data.users
            // 按创建时间倒序排列
            users.sort((a, b) => {
              const dateA = new Date(a.create_date || 0)
              const dateB = new Date(b.create_date || 0)
              return dateB - dateA
            })
            setRamUsers(users)
          }
          else toast.error(res.data.error || '加载失败')
        })
        .catch(err => toast.error('加载 RAM 用户失败: ' + (err.response?.data?.error || err.message)))
        .finally(() => setLoading(false))
    }
  }, [selectedAccount, accounts])

  useEffect(() => { if (selectedAccount) loadRamUsers() }, [selectedAccount, loadRamUsers])

  const [syncingRam, setSyncingRam] = useState(false)
  const handleSyncRamUsers = () => {
    if (selectedAccount === 'all') {
      toast.warning('请选择具体账号后再同步')
      return
    }
    setSyncingRam(true)
    axios.post(`/api/accounts/${selectedAccount}/ram/users/sync`)
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message || '同步成功')
          loadRamUsers()
        } else {
          toast.error(res.data.error || '同步失败')
        }
      })
      .catch(err => toast.error('同步失败: ' + (err.response?.data?.error || err.message)))
      .finally(() => setSyncingRam(false))
  }

  const handleCreateUser = () => {
    if (!newUser.user_name.trim()) {
      toast.warning('请填写用户名')
      return
    }
    const accountId = newUser.account_id || (selectedAccount !== 'all' ? selectedAccount : '')
    if (!accountId) {
      toast.warning('请选择所属账号')
      return
    }
    axios.post(`/api/accounts/${accountId}/ram/users`, newUser)
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message)
          setShowCreateForm(false)
          setNewUser({ user_name: '', display_name: '', comments: '', account_id: '' })
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

  // 禁止添加的危险权限列表
  const BLOCKED_POLICIES = ['AdministratorAccess']

  // 根据搜索关键词过滤策略列表（过滤掉禁止添加的权限）
  const filteredPolicies = (policyKeyword.trim()
    ? allPolicies.filter(p =>
        p.policy_name.toLowerCase().includes(policyKeyword.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(policyKeyword.toLowerCase()))
      )
    : allPolicies
  ).filter(p => !BLOCKED_POLICIES.includes(p.policy_name))

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
    if (BLOCKED_POLICIES.includes(selectedPolicy)) {
      toast.error(`禁止添加 ${selectedPolicy} 权限，该权限风险过高`)
      return
    }
    // 检查是否已存在该权限
    const exists = userPolicies.some(p => p.policy_name === selectedPolicy && p.policy_type === policyType)
    if (exists) {
      setDuplicatePolicyWarning(`该用户已拥有策略"${selectedPolicy}"，无需重复添加`)
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
      {duplicatePolicyWarning && (
        <div className="modal-overlay" onClick={() => setDuplicatePolicyWarning('')}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon" style={{ color: '#f59e0b' }}>⚠</div>
            <p className="modal-msg">{duplicatePolicyWarning}</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setDuplicatePolicyWarning('')}>知道了</button>
            </div>
          </div>
        </div>
      )}
      <div className="page-header">
        <h2>RAM管理</h2>
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
        <button className="btn-default" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? '取消' : '创建用户'}
        </button>
        <button className="btn-default" onClick={handleSyncRamUsers} disabled={syncingRam}>
          {syncingRam ? '同步中..' : '同步用户'}
        </button>
      </div>

      {/* 创建用户表单 */}
      {showCreateForm && (
        <div className="section-block form-section">
          <h3>创建 RAM 用户</h3>
          <div className="form-grid">
            <div className="form-item">
              <label>所属账号<span className="required">*</span></label>
              <select value={newUser.account_id || (selectedAccount !== 'all' ? selectedAccount : '')} onChange={e => setNewUser(prev => ({ ...prev, account_id: e.target.value }))}>
                <option value="">请选择账号</option>
                {accounts.map(acct => (
                  <option key={acct.id} value={acct.id}>{acct.name}</option>
                ))}
              </select>
            </div>
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
            <button className="btn-default" onClick={() => { setShowCreateForm(false); setNewUser({ user_name: '', display_name: '', comments: '', account_id: '' }) }}>取消</button>
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleUserSort('user_name')}>用户名{sortArrow('user_name')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleUserSort('display_name')}>显示名称{sortArrow('display_name')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleUserSort('user_principal_name')}>登录名称{sortArrow('user_principal_name')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleUserSort('access_keys')}>AccessKey ID{sortArrow('access_keys')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleUserSort('create_date')}>创建时间{sortArrow('create_date')}</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <Fragment key={`${user.account_id || ''}-${user.user_name}`}>
                    <tr>
                      {selectedAccount === 'all' && <td>{userKeyword ? highlightKeyword(user.account_name, userKeyword) : user.account_name}</td>}
                      <td>{userKeyword ? highlightKeyword(user.user_name, userKeyword) : user.user_name}</td>
                      <td>{userKeyword ? highlightKeyword(user.display_name || '-', userKeyword) : (user.display_name || '-')}</td>
                      <td className="td-mono">{userKeyword ? highlightKeyword(user.user_principal_name || user.user_name, userKeyword) : (user.user_principal_name || user.user_name)}</td>
                      <td className="td-mono">
                        {user.access_keys && user.access_keys.length > 0
                          ? (userKeyword ? highlightKeyword(user.access_keys.join(', '), userKeyword) : user.access_keys.join(', '))
                          : '-'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(user.create_date)}</td>
                      <td>{userKeyword ? highlightKeyword(user.comments || '-', userKeyword) : (user.comments || '-')}</td>
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
                            {policyLoading ? (
                              <div className="empty-state">加载中..</div>
                            ) : userPolicies.length === 0 ? (
                              <div className="empty-state">暂无权限策略</div>
                            ) : (
                              <table className="data-table inner-table">
                                <thead>
                                  <tr>
                                    <th>策略名称</th>
                                    <th>备注</th>
                                    <th>策略类型</th>
                                    <th>授权时间</th>
                                    <th>操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {userPolicies.map(p => (
                                    <tr key={`${p.policy_type}-${p.policy_name}`}>
                                      <td>{p.policy_name}</td>
                                      <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.description || ''}>{p.description || '-'}</td>
                                      <td>{p.policy_type === 'System' ? '系统策略' : '自定义策略'}</td>
                                      <td style={{ whiteSpace: 'nowrap' }}>{p.attachment_date ? fmtDate(p.attachment_date) : '-'}</td>
                                      <td>
                                        <button className="btn-link btn-danger-link" onClick={() => handleDetachPolicy(p.policy_name, p.policy_type)}>移除</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
      {confirmNode}
    </div>
  )
}

// ==================== 域名管理 ====================
function DnsManagement() {
  const toast = useToast()
  const searchFilterCtx = useContext(SearchFilterContext)
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
  const { showConfirm, confirmNode } = useConfirm()

  // 读取全局搜索过滤
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.type_key === 'dns') {
      const kw = searchFilterCtx.searchFilter.keyword
      if (kw) setDomainKeyword(kw)
      searchFilterCtx.setSearchFilter(null)
    }
  }, [searchFilterCtx?.searchFilter])

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

  const getDomainDaysLeft = (endDate) => {
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

  const getDomainStatusTag = (domain) => {
    const days = getDomainDaysLeft(domain.end_time)
    if (days === null) return <span className="ssl-status unknown">未知</span>
    if (days < 0) return <span className="ssl-status expired">已过期</span>
    if (days <= 7) return <span className="ssl-status critical">即将过期（{days}天）</span>
    if (days <= 30) return <span className="ssl-status warning">剩余 {days} 天</span>
    return <span className="ssl-status ok">剩余 {days} 天</span>
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
          <div className="search-bar" style={{ margin: 0, padding: 0, background: 'transparent', border: 'none', boxShadow: 'none', backdropFilter: 'none' }}>
            <select
              value={selectedAccount}
              onChange={e => { setSelectedAccount(e.target.value); setSelectedDomain(''); setDomains([]); setRecords([]) }}
            >
              <option value="all">全部账号</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input
              type="text"
              placeholder="搜索域名..."
              value={domainKeyword}
              onChange={e => setDomainKeyword(e.target.value)}
              style={{ width: 180 }}
            />
            <input
              type="text"
              placeholder="搜索持有者..."
              value={holderKeyword}
              onChange={e => setHolderKeyword(e.target.value)}
              style={{ width: 180 }}
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleDomainSort('status')}>状态{sortIcon('status')}</th>
                  <th style={{ width: 70 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedDomains.map(d => (
                  <tr key={`${d.account_id || ''}-${d.domain_name}`}
                    style={{ cursor: 'pointer', background: selectedDomain === d.domain_name ? '#eef2ff' : 'transparent' }}
                    onClick={() => setSelectedDomain(d.domain_name)}>
                    {selectedAccount === 'all' && <td style={{ color: '#64748b' }}>{domainKeyword ? highlightKeyword(d.account_name, domainKeyword) : d.account_name}</td>}
                    <td>{domainKeyword ? highlightKeyword(d.domain_name, domainKeyword) : d.domain_name}</td>
                    <td style={{ color: '#64748b' }}>{domainKeyword ? highlightKeyword(d.holder || '-', domainKeyword) : (d.holder || '-')}</td>
                    <td>{d.record_count}</td>
                    <td className="td-mono" style={{ color: d.end_time && (() => { const s=String(d.end_time).trim(); const ts=/^\d{10,13}$/.test(s)?(s.length===10?Number(s)*1000:Number(s)):new Date(s).getTime(); return !isNaN(ts)&&ts<Date.now() })() ? '#ef4444' : '#334155' }}>
                      {fmtDate(d.end_time)}
                    </td>
                    <td>{getDomainStatusTag(d)}</td>
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
              <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
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
            <div className="modal-icon">✏️</div>
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
      {confirmNode}
    </div>
  )
}

// ==================== SSL 证书管理 ====================
function SslManagement() {
  const toast = useToast()
  const searchFilterCtx = useContext(SearchFilterContext)
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(false)
  const { sortKey, sortDir, setSortKey, setSortDir, handleSort, sortArrow, sortData } = useSortable('end_date')
  const [certKeyword, setCertKeyword] = useState('')

  // 读取全局搜索过滤
  useEffect(() => {
    if (searchFilterCtx?.searchFilter?.type_key === 'ssl') {
      const kw = searchFilterCtx.searchFilter.keyword
      if (kw) setCertKeyword(kw)
      searchFilterCtx.setSearchFilter(null)
    }
  }, [searchFilterCtx?.searchFilter])

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
    { key: 'status', label: '状态', sortable: true, render: (_, c) => getStatusTag(c) },
  ]

  const visibleColumns = sslColumns.filter(c => c.showOnly !== 'all' || selectedAccount === 'all')

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

      <div className="section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: 0, padding: 0, border: 'none' }}>证书列表（{sortedCerts.length} 个）</h3>
          <div className="search-bar" style={{ margin: 0, padding: 0, gap: 8, background: 'transparent', border: 'none', boxShadow: 'none', backdropFilter: 'none' }}>
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
        </div>
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
                      style={col.sortable ? { cursor: 'pointer', userSelect: 'none' } : {}}
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
                        {col.render 
                          ? (certKeyword && typeof col.render(c[col.key], c) === 'string' 
                              ? highlightKeyword(col.render(c[col.key], c), certKeyword) 
                              : col.render(c[col.key], c))
                          : (certKeyword ? highlightKeyword(c[col.key] || '-', certKeyword) : (c[col.key] || '-'))}
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

// ==================== 监控管理====================
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
      if (!selectedAccount) setSelectedAccount('all')
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
    if (value === null) return '#94a3b8'
    const num = parseFloat(value)
    if (num >= 90) return '#ef4444'
    if (num >= 70) return '#f59e0b'
    return '#10b981'
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
    'acs_rocketmq': 'RocketMQ 消息队列',
    'acs_apigateway': 'API 网关',
    'acs_k8s': 'Kubernetes 容器服务',
    'acs_mse': 'MSE 微服务引擎',
    'acs_memstore': 'Tair 内存数据库',
    'acs_alb': 'ALB 应用型负载均衡',
    'acs_nlb': 'NLB 网络型负载均衡',
    'acs_ga': 'GA 全球加速',
    'acs_privatelink': 'PrivateLink 私网连接',
    'acs_pvtz': 'PrivateZone 云解析',
    'acs_dns': 'DNS 云解析',
    'acs_fc': 'FC 函数计算',
    'acs_sae': 'SAE Serverless 应用引擎',
    'acs_ons': 'ONS 消息队列',
    'acs_amqp': 'AMQP 消息队列',
    'acs_eventbridge': 'EventBridge 事件总线',
    'acs_kafka': 'Kafka 消息队列',
    'acs_acr': 'ACR 容器镜像服务',
    'acs_ack': 'ACK 容器服务',
    'acs_cms': 'CMS 云监控',
    'acs_mns': 'MNS 消息服务',
    'acs_iot': 'IoT 物联网',
    'acs_hbase': 'HBase 数据库',
    'acs_flink': 'Flink 实时计算',
    'acs_hologres': 'Hologres 实时数仓',
    'acs_dcdn': 'DCDN 全站加速',
    'acs_opensearch': 'OpenSearch 开放搜索',
    'acs_newbgpddos': 'DDoS 高防(新)',
    'strategy_sys': '系统策略',
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
    'DiskReadWriteBPSUtilization': '磁盘读写BPS使用率',
    'DiskReadBPS': '磁盘读BPS',
    'DiskWriteBPS': '磁盘写BPS',
    'DiskReadIOPS': '磁盘读IOPS',
    'DiskWriteIOPS': '磁盘写IOPS',
    'cpu_idle': 'CPU 空闲率',
    'memory_usedspace': '内存已用空间',
    'memory_totalspace': '内存总空间',
    'diskusage_inode': 'inode 使用率',
    'load_1m': '1分钟负载',
    'load_15m': '15分钟负载',
    'networkin_pps': '入网包速率',
    'networkout_pps': '出网包速率',
    'DiskReadLatency': '磁盘读延迟',
    'DiskWriteLatency': '磁盘写延迟',
    'GPUUtilization': 'GPU 使用率',
    'GPUMemoryUtilization': 'GPU 内存使用率',
    'IntranetInRate': '内网入向流量速率',
    'IntranetOutRate': '内网出向流量速率',
    'InternetInRate': '公网入向流量速率',
    'InternetOutRate': '公网出向流量速率',
    'SessionNewLimitDropConnection': '新建连接限速丢弃数',
    'net_in.rate_percentage': '入网带宽使用率',
    'ShardingMemoryUsage': '分片内存使用率',
    'InstanceTrafficRXUtilization': '实例入向流量使用率',
    'StandardConnectionUsage': '标准版连接数使用率',
    'InstanceTrafficTXUtilization': '实例出向流量使用率',
    'ShardingCpuUsage': '分片CPU使用率',
    'ShardingConnectionUsage': '分片连接数使用率',
    'StandardCpuUsage': '标准版CPU使用率',
    'StandardMemoryUsage': '标准版内存使用率',
    'net_out.rate_percentage': '出网带宽使用率',
    'ConnectionUsageUtilization': '连接数使用率',
    'IntranetInRatio': '内网入向带宽使用率',
    'IntranetOutRatio': '内网出向带宽使用率',
    'InternetInRatio': '公网入向带宽使用率',
    'InternetOutRatio': '公网出向带宽使用率',
    'CapacityUsedPercent': '容量使用百分比',
    'check_point_create_success_eq_0_10min': 'Checkpoint创建成功次数为0(10分钟)',
    'NumOfCheckpoints': 'Checkpoint数量',
    'restart_gt_2_10min': '10分钟内重启次数超过2次',
    'NumOfRestart': '重启次数',
    'delay_gt_30_min': '延迟超过30分钟',
    'CurrentEmitEventTimeLag': '当前事件时间延迟',
    'ConsumerLagPerGidTopic': '消费者延迟(按Gid和Topic)',
    'load_per_core_1m': '每核1分钟平均负载',
    'diskusage_total': '磁盘总使用率',
    'load_per_core_5m': '每核5分钟平均负载',
    'load_per_core_15m': '每核15分钟平均负载',
    'cpu_total_per_core': '每核CPU使用率',
    'memory_usedutilization_per_core': '每核内存使用率',
    'disk_readbytes_per_core': '每核磁盘读字节数',
    'disk_writebytes_per_core': '每核磁盘写字节数',
    'networkin_rate_per_core': '每核入网流量速率',
    'networkout_rate_per_core': '每核出网流量速率',
    'CPUUtilization': 'CPU使用率',
    'one_second_executing_sqls': '1秒内执行的SQL数',
    'iops_usage': 'IOPS使用率',
    'mem_usage': '内存使用率',
    'local_fs_size_usage': '本地文件系统使用率',
    'cpu_usage': 'CPU使用率',
    'one_second_executing_sqls_per_core': '每核1秒内执行的SQL数',
    'iops_usage_per_core': '每核IOPS使用率',
    'mem_usage_per_core': '每核内存使用率',
    'local_fs_size_usage_per_core': '每核本地文件系统使用率',
    'cpu_usage_per_core': '每核CPU使用率',
    'ShardingDiskUtilization': '分片磁盘使用率',
    'DiskUtilization': '磁盘使用率',
    'ConnectionUtilization': '连接数使用率',
    'storage_usage_percent': '存储使用百分比',
    'CodeCount_5': '5XX状态码数量',
    'CodeCount_4': '4XX状态码数量',
    'LossQPSbyApp': '查询限流QPS',
    'ComputeResourceRatiobyApp': '计算资源使用率',
    'InstanceApiCallTps': '实例API调用频率',
    'SendDLQMessageCountPerGidTopic': '每分钟死信消息数(按Group/Topic)',
    'ReceiveMessageCountPerGid': '消费者每分钟接收消息数(按Group)',
    'SendMessageCountPerTopic': '生产者每分钟发送消息数(按Topic)',
    'LoadBalancerHTTPCode5XX': '负载均衡5XX状态码',
    'vm.MemoryUtilization': '虚拟机内存使用率',
    'New_connection': '新建连接数',
    'AttackTraffic': '攻击流量',
    'In_Traffic': '入向流量',
    'NodeDiskUtilization': '节点磁盘使用率',
    'NodeCPUUtilization': '节点CPU使用率',
    'NodeHeapMemoryUtilization': '节点堆内存使用率',
    'ClusterStatus': '集群状态',
    'InstanceNewConnectionUtilization': '实例新建连接数使用率',
    'Out_Traffic': '出向流量',
    'MaxConnection': '最大连接数',
    'ActiveConnection': '活跃连接数',
    'DropConnection': '丢弃连接数',
    'DropTraffic': '丢弃流量',
    'TrafficLimit': '流量限制',
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
    } catch (err) {}
    return res
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>监控管理</h2>
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
        <h3 style={{ color: filteredActiveAlarms.length > 0 ? '#ef4444' : '#334155' }}>
          当前告警（{filteredActiveAlarms.length}{filteredActiveAlarms.length !== activeAlarms.length ? `/${activeAlarms.length}` : ''} 个）
        </h3>
        {activeAlarms.length === 0 ? (
          <div className="empty-state" style={{ color: '#10b981' }}>暂无活跃告警</div>
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
                    <td>{METRIC_MAP[a.metric_name] || a.metric_name || '-'}</td>
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

// ==================== 网络管理 ====================
function NetworkManagement() {
  const [activeTab, setActiveTab] = useState('vpc')
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [regions, setRegions] = useState([])
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const { sortKey, sortDir, setSortKey, handleSort, sortArrow, sortData } = useSortable()

  const tabs = [
    { key: 'vpc', label: 'VPC' },
    { key: 'vswitch', label: '交换机' },
    { key: 'eip', label: '弹性公网IP' },
    { key: 'nat', label: 'NAT网关' },
  ]

  const tabColumns = {
    vpc: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: 'VPC ID', sortable: true },
      { key: 'vpc_name', label: '名称', sortable: true },
      { key: 'cidr_block', label: '网段', sortable: true },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
      { key: 'created_time', label: '创建时间', sortable: true, render: v => fmtDate(v) },
    ],
    vswitch: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '交换机ID', sortable: true },
      { key: 'vswitch_name', label: '名称', sortable: true },
      { key: 'vpc_id', label: 'VPC ID', sortable: true },
      { key: 'cidr_block', label: '网段', sortable: true },
      { key: 'zone_id', label: '可用区', sortable: true, render: v => { if (!v) return '-'; const parts = v.split('-'); const zone = parts[parts.length - 1]; return `可用区${zone.toUpperCase()}` } },
      { key: 'available_ip_count', label: '可用IPv4地址数', sortable: true, render: v => v ?? 0 },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
    ],
    eip: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '分配ID', sortable: true },
      { key: 'ip_address', label: 'IP地址', sortable: true, className: 'td-mono' },
      { key: 'name', label: '名称', sortable: true },
      { key: 'status', label: '状态', sortable: true, render: v => <span className={`status-tag status-${v}`}>{STATUS_LABELS[v] || v}</span> },
      { key: 'bandwidth', label: '带宽', sortable: true, render: v => v ? `${v}Mbps` : '-' },
      { key: 'charge_type', label: '计费方式', sortable: true, render: v => ({ PayByTraffic: '按流量', PayByBandwidth: '按带宽' }[v] || v) },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
    ],
    nat: [
      { key: 'account_name', label: '账号', sortable: true, render: nowrap },
      { key: 'instance_id', label: '网关ID', sortable: true },
      { key: 'name', label: '名称', sortable: true },
      { key: 'spec', label: '规格', sortable: true, render: v => ({ Small: '小型', Middle: '中型', Large: '大型' }[v] || v) },
      { key: 'vpc_id', label: 'VPC ID', sortable: true },
      { key: 'region_id', label: '区域', sortable: true, render: renderRegion },
      { key: 'created_time', label: '创建时间', sortable: true, render: v => fmtDate(v) },
    ],
  }

  const apiMap = { vpc: '/api/vpc', vswitch: '/api/vswitch', eip: '/api/eip', nat: '/api/nat' }

  useEffect(() => {
    axios.get('/api/accounts').then(res => {
      setAccounts(res.data)
      if (res.data.length > 0) setSelectedAccount('all')
    })
    axios.get('/api/regions').then(res => setRegions(res.data)).catch(() => {})
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (selectedAccount && selectedAccount !== 'all') params.account_id = selectedAccount
    if (searchKeyword) params.keyword = searchKeyword
    if (regionFilter) params.region = regionFilter

    axios.get(apiMap[activeTab], { params })
      .then(res => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [activeTab, selectedAccount, searchKeyword, regionFilter])

  useEffect(() => { loadData() }, [loadData])

  // 防抖自动搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchKeyword(keyword)
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword])

  // 切换标签时保留搜索关键词，只重置地域过滤和排序
  useEffect(() => { setRegionFilter(''); setSortKey('') }, [activeTab])

  const handleSearch = () => { setSearchKeyword(keyword) }

  const sortedData = sortData(data)

  const columns = tabColumns[activeTab] || []

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>网络管理</h2>
      </div>

      <div className="search-bar">
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="all">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="">全部区域</option>
          {regions.map(r => <option key={r} value={r}>{REGION_LABELS[r] || r}</option>)}
        </select>
        <input type="text" placeholder="搜索ID/名称/网段/IP..." value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>
          {loading ? '查询中..' : '搜索'}
        </button>
        <button className="btn-default" onClick={() => { setKeyword(''); setSearchKeyword(''); setRegionFilter(''); setSelectedAccount('all') }}>重置</button>
      </div>

      <div className="resource-tabs">
        {tabs.map(t => (
          <div key={t.key} className={`resource-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</div>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : sortedData.length === 0 ? (
        <div className="empty-state">暂无数据，请先同步账号资源</div>
      ) : (
        <div className="section-block">
          <div className="table-info">共{sortedData.length}条记录{sortKey ? '(已排序)' : ''}</div>
          <div className="overview-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className={col.sortable ? 'sortable' : ''} onClick={col.sortable ? () => handleSort(col.key) : undefined}>
                      {col.label}{col.sortable ? sortArrow(col.key) : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, i) => (
                  <tr key={row.instance_id || i}>
                    {columns.map(col => (
                      <td key={col.key} className={col.className || ''}>
                        {col.render 
                          ? (keyword && typeof col.render(row[col.key], row) === 'string' 
                              ? highlightKeyword(col.render(row[col.key], row), keyword) 
                              : col.render(row[col.key], row))
                          : (keyword ? highlightKeyword(row[col.key] ?? '-', keyword) : (row[col.key] ?? '-'))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 安全事件 ====================
function SecurityEvents() {
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [daysFilter, setDaysFilter] = useState('7')
  const [levelFilter, setLevelFilter] = useState('')
  const { sortKey, sortDir, handleSort, sortArrow, sortData } = useSortable('', 'desc')

  const levelLabels = {
    serious: '紧急',
    suspicious: '可疑',
    remind: '提醒',
  }

  const levelColors = {
    serious: '#ef4444',
    suspicious: '#f59e0b',
    remind: '#3b82f6',
  }

  const statusLabels = {
    '0': '待处理',
    '1': '已处理',
    '6': '已忽略',
    'Y': '已处理',
    'N': '待处理',
  }

  useEffect(() => {
    axios.get('/api/accounts').then(res => {
      setAccounts(res.data)
      if (res.data.length > 0) setSelectedAccount('all')
    })
  }, [])

  const loadEvents = useCallback(() => {
    setLoading(true)
    const params = { days: daysFilter }
    if (selectedAccount && selectedAccount !== 'all') params.account_id = selectedAccount
    if (levelFilter) params.level = levelFilter

    axios.get('/api/security-events', { params })
      .then(res => setEvents(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [selectedAccount, daysFilter, levelFilter])

  useEffect(() => { loadEvents() }, [loadEvents])

  const sortedEvents = sortData(events)

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>安全事件</h2>
      </div>

      <div className="search-bar">
        <label>账号：</label>
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="all">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label>时间范围：</label>
        <select value={daysFilter} onChange={e => setDaysFilter(e.target.value)}>
          <option value="7">最近7天</option>
          <option value="30">最近30天</option>
          <option value="90">最近90天</option>
        </select>
        <label>告警级别：</label>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="">全部</option>
          <option value="serious">紧急</option>
          <option value="suspicious">可疑</option>
          <option value="remind">提醒</option>
        </select>
        <button className="btn-default" onClick={loadEvents}>刷新</button>
      </div>

      <div className="section-block">
        {loading ? (
          <div className="loading-state">加载中...</div>
        ) : sortedEvents.length === 0 ? (
          <div className="empty-state">暂无安全事件数据</div>
        ) : (
          <div className="overview-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('account_name')}>账号{sortArrow('account_name')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('event_name')}>事件名称{sortArrow('event_name')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('event_type')}>事件类型{sortArrow('event_type')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('level')}>告警级别{sortArrow('level')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('instance_name')}>关联实例{sortArrow('instance_name')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('internet_ip')}>公网IP{sortArrow('internet_ip')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('intranet_ip')}>内网IP{sortArrow('intranet_ip')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('dealed')}>处理状态{sortArrow('dealed')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('gmt_create')}>发生时间{sortArrow('gmt_create')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((e, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.account_name}</td>
                  <td>{e.event_name || '-'}</td>
                  <td>{e.event_type || '-'}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      background: levelColors[e.level] || '#94a3b8',
                      whiteSpace: 'nowrap',
                    }}>
                      {levelLabels[e.level] || e.level || '-'}
                    </span>
                  </td>
                  <td>{e.instance_name || '-'}</td>
                  <td className="td-mono">{e.internet_ip || '-'}</td>
                  <td className="td-mono">{e.intranet_ip || '-'}</td>
                  <td>
                    <span className={`status-tag ${e.dealed === 'Y' || e.dealed === '1' ? 'status-active' : 'status-Creating'}`}>
                      {statusLabels[String(e.dealed)] || e.dealed || '-'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.gmt_create)}</td>
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
  const { toast, showConfirm, confirmNode, accounts } = useManagementBase()
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
  // 多选
  const [selectedIds, setSelectedIds] = useState([])

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
    loadLogs(1)
  }, [])

  const handleSearch = () => {
    setSelectedIds([])
    loadLogs(1)
  }

  const handleReset = () => {
    setAccountId(''); setModule(''); setKeyword('')
    setDateFrom(today); setDateTo(today)
    setSelectedIds([])
    setTimeout(() => loadLogs(1), 0)
  }

  const handleClear = async () => {
    const ok = await showConfirm('确定要清空全部操作日志吗？此操作不可恢复。')
    if (!ok) return
    axios.delete('/api/logs')
      .then(() => { toast.success('日志已清空'); loadLogs(1) })
      .catch(err => toast.error('清空失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleDeleteLog = async (id) => {
    const ok = await showConfirm('确定删除这条日志？')
    if (!ok) return
    axios.delete(`/api/logs/${id}`)
      .then(() => { toast.success('日志已删除'); loadLogs(page) })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      toast.warning('请先选择要删除的日志')
      return
    }
    const ok = await showConfirm(`确定删除选中的 ${selectedIds.length} 条日志？`)
    if (!ok) return
    axios.post('/api/logs/batch', { ids: selectedIds })
      .then(res => {
        if (res.data.success) {
          toast.success(res.data.message || '批量删除成功')
          setSelectedIds([])
          loadLogs(page)
        } else {
          toast.error(res.data.error || '删除失败')
        }
      })
      .catch(err => toast.error('删除失败: ' + (err.response?.data?.error || err.message)))
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(logs.map(l => l.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id])
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id))
    }
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
        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">全部账号</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={module} onChange={e => setModule(e.target.value)}>
          <option value="">全部模块</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
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
        {selectedIds.length > 0 && (
          <button className="btn-default" style={{ color: '#ef4444' }} onClick={handleBatchDelete}>
            删除选中 ({selectedIds.length})
          </button>
        )}
        {/* <button className="btn-default" style={{ marginLeft: 'auto', color: '#ef4444' }} onClick={handleClear}>清空全部操作日志</button> */}
      </div>

      {/* 日志表格 */}
      <div className="overview-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={logs.length > 0 && selectedIds.length === logs.length} onChange={handleSelectAll} />
              </th>
              <th style={{ width: 160 }}>时间</th>
              <th style={{ width: 120, whiteSpace: 'nowrap' }}>账号</th>
              <th style={{ width: 100, whiteSpace: 'nowrap' }}>模块</th>
              <th style={{ width: 130, whiteSpace: 'nowrap' }}>操作</th>
              <th style={{ width: 80 }}>结果</th>
              <th style={{ width: 130, whiteSpace: 'nowrap' }}>操作IP</th>
              <th>操作详情</th>
              <th style={{ width: 60 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                {loading ? '加载中..' : '暂无操作日志'}
              </td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(log.id)} onChange={e => handleSelectOne(log.id, e.target.checked)} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtLogTime(log.created_at)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{log.account_name || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{log.module || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{log.action || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className={`alarm-status ${log.success === 1 ? 'alarm-ok' : 'alarm-alarm'}`}>
                    {log.success === 1 ? '成功' : '失败'}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>{log.ip_address || '-'}</td>
                <td>
                  {log.detail || '-'}
                  {log.success === 0 && log.error_msg && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginTop: 2 }}>{log.error_msg}</div>
                  )}
                </td>
                <td className="td-actions">
                  <button className="btn-link btn-danger-link" onClick={() => handleDeleteLog(log.id)}>删除</button>
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
      {confirmNode}
    </div>
  )
}

// ==================== 主应用组件====================
const PAGE_LABELS = {
  overview: '资源概览',
  resources: '资源管理',
  network: '网络管理',
  publicip: '公网大全',
  weblinks: '网址大全',
  bills: '账单管理',
  accounts: '平台设置',
  ram: 'RAM 管理',
  dns: '域名管理',
  ssl: 'SSL 证书',
  security: '安全事件',
  monitor: '监控管理',
  logs: '日志管理',
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchFilter, setSearchFilter] = useState(null) // { keyword, type_key, tab }

  // 从 URL pathname 获取当前页面（HashRouter 中 pathname 是 /））
  // HashRouter 使用 location.hash，但 useLocation 返回的 pathname 在 HashRouter 中实际是 hash 路径
  const getPage = () => {
    // HashRouter 中 useLocation 的 pathname 就是 hash 路径（去掉 # 后的部分）
    const path = location.pathname.replace(/^\//, '')
    return PAGE_LABELS[path] ? path : 'overview'
  }

  const activeMenu = getPage()

  const setActiveMenu = (page, filter = null) => {
    setSearchFilter(filter)
    navigate('/' + page)
  }

  const renderPage = () => {
    switch (activeMenu) {
      case 'overview': return <ResourceOverview />
      case 'resources': return <ResourceManagement />
      case 'network': return <NetworkManagement />
      case 'publicip': return <PublicIPManagement />
      case 'weblinks': return <WebLinksManagement />
      case 'bills': return <BillManagement />
      case 'accounts': return <AccountManagement />
      case 'ram': return <RamManagement />
      case 'dns': return <DnsManagement />
      case 'ssl': return <SslManagement />
      case 'security': return <SecurityEvents />
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
          <MenuContext.Provider value={{ onMenuChange: setActiveMenu }}>
            <SearchFilterContext.Provider value={{ searchFilter, setSearchFilter }}>
              {renderPage()}
            </SearchFilterContext.Provider>
          </MenuContext.Provider>
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
