import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Lock, X, Trash2, ArrowUpCircle, ArrowDownCircle, LogOut, UserPlus, KeyRound } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, ReferenceLine } from 'recharts'
import { supabase, supabaseCreateUserClient } from './supabaseClient'

function fmt(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pnlFor(t) {
  if (t.status !== 'CLOSED' || t.exit_price === null) return null
  const pctMove = (t.exit_price - t.entry_price) / t.entry_price
  // the entered close % directly represents the trade's result: negative = loss, positive = profit,
  // regardless of side (side is just a record of the position direction, not part of the P&L sign).
  const gross = t.amount * (t.leverage || 1) * pctMove
  return gross - Number(t.fees || 0)
}

// Custom candlestick shape for recharts. Used with a Bar whose dataKey returns
// [low, high] (a "range" bar) — recharts maps that range onto y/height for us,
// and we use payload's open/close to draw the wick and body within that range.
function CandleShape(props) {
  const { x, y, width, height, payload } = props
  const { open, close, high, low } = payload
  const isUp = close >= open
  const color = isUp ? '#3DDC84' : '#E8574A'
  const range = (high - low) || 1
  const yFor = (v) => y + ((high - v) / range) * height
  const wickX = x + width / 2
  const bodyTop = Math.min(yFor(open), yFor(close))
  const bodyBottom = Math.max(yFor(open), yFor(close))
  const bodyHeight = Math.max(1, bodyBottom - bodyTop)
  const bodyWidth = Math.max(2, width * 0.6)
  const bodyX = x + (width - bodyWidth) / 2
  return (
    <g>
      <line x1={wickX} y1={y} x2={wickX} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  )
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null)
  const [trades, setTrades] = useState([])
  const [profiles, setProfiles] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [deposits, setDeposits] = useState([])
  const [tab, setTab] = useState('live')
  const [userFilter, setUserFilter] = useState('ALL')
  const [loadError, setLoadError] = useState(null)

  // Track auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Load this user's profile once logged in
  useEffect(() => {
    if (!session) { setProfile(null); return }
    setTab('live')
    ;(async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (!error) setProfile(data)
    })()
  }, [session])

  const loadTrades = useCallback(async () => {
    const { data, error } = await supabase.from('trades').select('*').order('entry_date', { ascending: false })
    if (error) setLoadError(error.message)
    else { setTrades(data); setLoadError(null) }
  }, [])

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('id, username, role, starting_pot')
    if (!error) setProfiles(data)
  }, [])

  const loadWithdrawals = useCallback(async () => {
    const { data, error } = await supabase.from('withdrawals').select('*').order('withdrawal_date', { ascending: false })
    if (!error) setWithdrawals(data)
  }, [])

  const loadDeposits = useCallback(async () => {
    const { data, error } = await supabase.from('deposits').select('*').order('deposit_date', { ascending: false })
    if (!error) setDeposits(data)
  }, [])

  useEffect(() => {
    if (!session) return
    loadTrades()
    loadProfiles()
    loadWithdrawals()
    loadDeposits()
    // live updates so all logged-in users see changes without refreshing
    const channel = supabase
      .channel('trades-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => loadTrades())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadProfiles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => loadWithdrawals())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => loadDeposits())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, loadTrades, loadProfiles, loadWithdrawals, loadDeposits])

  if (session === undefined) {
    return <div className="center-screen mono" style={{ color: '#6B7280', fontSize: 12 }}>loading ledger…</div>
  }

  if (!session || !profile) {
    return <AuthScreen />
  }

  return (
    <MainApp
      currentUser={profile}
      profiles={profiles}
      trades={trades}
      reloadTrades={loadTrades}
      reloadProfiles={loadProfiles}
      withdrawals={withdrawals}
      reloadWithdrawals={loadWithdrawals}
      deposits={deposits}
      reloadDeposits={loadDeposits}
      tab={tab}
      setTab={setTab}
      userFilter={userFilter}
      setUserFilter={setUserFilter}
      loadError={loadError}
    />
  )
}

function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError(''); setNotice('')
    if (username.trim().length < 2) { setError('username too short'); return }
    if (password.length < 6) { setError('password must be at least 6 characters'); return }
    if (password !== confirm) { setError('passwords do not match'); return }
    setBusy(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() } },
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    setNotice('Account created. If email confirmation is on, check your inbox before logging in.')
    setMode('login')
  }

  return (
    <div className="center-screen">
      <div className="auth-wrap">
        <h1 className="auth-title">LEDGER</h1>
        <p className="auth-subtitle">trade log — per-user accounts</p>

        <div className="auth-toggle">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>LOG IN</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>SIGN UP</button>
        </div>

        <form className="auth-card" onSubmit={mode === 'login' ? handleLogin : handleSignup}>
          <div className="field">
            <label>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
          </div>
          {mode === 'signup' && (
            <div className="field">
              <label>USERNAME</label>
              <input value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {mode === 'signup' && (
            <div className="field">
              <label>CONFIRM PASSWORD</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          {notice && <p className="error-text" style={{ color: '#3DDC84' }}>{notice}</p>}
          <button className="btn-primary" type="submit" disabled={busy}>
            {mode === 'login' ? <>LOG IN</> : <>CREATE ACCOUNT</>}
          </button>
          {mode === 'signup' && <p className="auth-hint">first account created becomes admin</p>}
        </form>
      </div>
    </div>
  )
}

function MainApp({ currentUser, profiles, trades, reloadTrades, reloadProfiles, withdrawals, reloadWithdrawals, deposits, reloadDeposits, tab, setTab, userFilter, setUserFilter, loadError }) {
  const isAdmin = currentUser.role === 'admin'
  useEffect(() => { if (!isAdmin && tab === 'mine') setTab('live') }, [isAdmin, tab, setTab])
  const [potInputs, setPotInputs] = useState({})
  const [potBusyId, setPotBusyId] = useState(null)

  // Live BTC/USDT price, polled from Binance's public API while the Live tab is open.
  const [livePrice, setLivePrice] = useState(null)
  const [priceError, setPriceError] = useState(null)
  useEffect(() => {
    if (tab !== 'live') return
    let active = true
    async function fetchPrice() {
      try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
        if (!res.ok) throw new Error('bad response')
        const data = await res.json()
        if (active) { setLivePrice(Number(data.price)); setPriceError(null) }
      } catch (e) {
        if (active) setPriceError('Could not fetch live BTC/USDT price right now')
      }
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [tab])

  // 4H candlestick data for BTC/USDT, also from Binance's public API. Refreshed less
  // often than the live price since 4-hour candles don't change that fast.
  const [candles, setCandles] = useState([])
  const [candlesError, setCandlesError] = useState(null)
  useEffect(() => {
    if (tab !== 'live') return
    let active = true
    async function fetchCandles() {
      try {
        const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=24')
        if (!res.ok) throw new Error('bad response')
        const data = await res.json()
        const parsed = data.map(k => ({
          time: k[0],
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
        }))
        if (active) { setCandles(parsed); setCandlesError(null) }
      } catch (e) {
        if (active) setCandlesError('Could not fetch chart data right now')
      }
    }
    fetchCandles()
    const interval = setInterval(fetchCandles, 30000)
    return () => { active = false; clearInterval(interval) }
  }, [tab])

  // each user's most recent OPEN trade (RLS already limits `trades` to just your own
  // unless you're admin, so this naturally scopes correctly for either case)
  const latestOpenTrades = useMemo(() => {
    const latestByUser = {}
    trades.filter(t => t.status === 'OPEN').forEach(t => {
      const existing = latestByUser[t.username]
      if (!existing || (t.created_at || '') > (existing.created_at || '')) {
        latestByUser[t.username] = t
      }
    })
    return Object.values(latestByUser).sort((a, b) => a.username.localeCompare(b.username))
  }, [trades])

  function livePnlFor(t, price) {
    if (price === null || price === undefined) return null
    const pctMove = (price - t.entry_price) / t.entry_price
    const directional = t.side === 'LONG' ? pctMove : -pctMove
    return t.amount * (t.leverage || 1) * directional
  }

  useEffect(() => {
    const next = {}
    profiles.forEach(p => { next[p.id] = String(p.starting_pot ?? 0) })
    setPotInputs(next)
  }, [profiles])

  async function savePot(profileId) {
    setPotBusyId(profileId)
    const { error } = await supabase.from('profiles').update({ starting_pot: Number(potInputs[profileId]) || 0 }).eq('id', profileId)
    setPotBusyId(null)
    if (!error) reloadProfiles()
  }

  const [newUser, setNewUser] = useState({ username: '', email: '', password: '' })
  const [newUserBusy, setNewUserBusy] = useState(false)
  const [newUserError, setNewUserError] = useState('')
  const [newUserSuccess, setNewUserSuccess] = useState('')

  async function handleAddUser(e) {
    e.preventDefault()
    setNewUserError(''); setNewUserSuccess('')
    if (newUser.username.trim().length < 2) { setNewUserError('username too short'); return }
    if (newUser.password.length < 6) { setNewUserError('password must be at least 6 characters'); return }
    setNewUserBusy(true)
    // uses the isolated client so this doesn't swap out the admin's own session
    const { error } = await supabaseCreateUserClient.auth.signUp({
      email: newUser.email.trim(),
      password: newUser.password,
      options: { data: { username: newUser.username.trim() } },
    })
    setNewUserBusy(false)
    if (error) { setNewUserError(error.message); return }
    setNewUserSuccess(`Account created for ${newUser.username.trim()}. Share the email + password with them directly.`)
    setNewUser({ username: '', email: '', password: '' })
    reloadProfiles()
  }

  const usernames = useMemo(() => profiles.map(p => p.username).sort(), [profiles])
  const filterOptions = ['ALL', ...usernames]

  // realized P&L per username, and each user's individual pot (their starting pot + their own realized P&L)
  const userPots = useMemo(() => {
    const realizedByUser = {}
    trades.filter(t => t.status === 'CLOSED').forEach(t => {
      realizedByUser[t.username] = (realizedByUser[t.username] || 0) + (pnlFor(t) || 0)
    })
    const withdrawnByUser = {}
    withdrawals.forEach(w => {
      withdrawnByUser[w.username] = (withdrawnByUser[w.username] || 0) + Number(w.amount)
    })
    const depositedByUser = {}
    deposits.forEach(d => {
      depositedByUser[d.username] = (depositedByUser[d.username] || 0) + Number(d.amount)
    })
    return profiles.map(p => {
      const realized = realizedByUser[p.username] || 0
      const withdrawn = withdrawnByUser[p.username] || 0
      const deposited = depositedByUser[p.username] || 0
      return {
        ...p,
        realized,
        withdrawn,
        deposited,
        pot: Number(p.starting_pot ?? 0) + realized + deposited - withdrawn,
      }
    }).sort((a, b) => a.username.localeCompare(b.username))
  }, [profiles, trades, withdrawals, deposits])

  // cumulative pot value over time for the logged-in user, plotted as a line chart.
  // merges closed trades (add P&L), deposits (add), and withdrawals (subtract) chronologically.
  const potHistory = useMemo(() => {
    const starting = Number(currentUser.starting_pot ?? 0)
    const events = [
      ...trades
        .filter(t => t.username === currentUser.username && t.status === 'CLOSED' && t.exit_date)
        .map(t => ({ date: t.exit_date, delta: pnlFor(t) || 0 })),
      ...withdrawals
        .filter(w => w.username === currentUser.username)
        .map(w => ({ date: w.withdrawal_date, delta: -Number(w.amount) })),
      ...deposits
        .filter(d => d.username === currentUser.username)
        .map(d => ({ date: d.deposit_date, delta: Number(d.amount) })),
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    let running = starting
    const points = [{ date: 'start', pot: running }]
    events.forEach(e => {
      running += e.delta
      points.push({ date: e.date, pot: running })
    })
    return points
  }, [trades, withdrawals, deposits, currentUser])

  const [form, setForm] = useState({ user: isAdmin ? '' : currentUser.username, side: 'LONG', amount: '', leverage: '1', entryPrice: '', entryDate: todayStr(), notes: '' })
  const [closeModal, setCloseModal] = useState(null)
  const [closeForm, setCloseForm] = useState({ movePercent: '', exitDate: todayStr(), fees: '' })
  const [actionError, setActionError] = useState(null)

  const [withdrawForm, setWithdrawForm] = useState({ user: '', amount: '', date: todayStr(), notes: '' })
  const [withdrawBusy, setWithdrawBusy] = useState(false)

  async function handleWithdraw(e) {
    e.preventDefault()
    if (!withdrawForm.user || !withdrawForm.amount) return
    const ownerProfile = profiles.find(p => p.username === withdrawForm.user)
    if (!ownerProfile) { setActionError('Could not find that user.'); return }
    setWithdrawBusy(true)
    const { error } = await supabase.from('withdrawals').insert({
      user_id: ownerProfile.id,
      username: withdrawForm.user,
      amount: Number(withdrawForm.amount),
      withdrawal_date: withdrawForm.date,
      notes: withdrawForm.notes.trim(),
    })
    setWithdrawBusy(false)
    if (error) setActionError(error.message)
    else { setActionError(null); setWithdrawForm({ user: '', amount: '', date: todayStr(), notes: '' }); reloadWithdrawals() }
  }

  async function deleteWithdrawal(id) {
    const { error } = await supabase.from('withdrawals').delete().eq('id', id)
    if (error) setActionError(error.message); else reloadWithdrawals()
  }

  const [depositForm, setDepositForm] = useState({ user: '', amount: '', date: todayStr(), notes: '' })
  const [depositBusy, setDepositBusy] = useState(false)

  async function handleDeposit(e) {
    e.preventDefault()
    if (!depositForm.user || !depositForm.amount) return
    const ownerProfile = profiles.find(p => p.username === depositForm.user)
    if (!ownerProfile) { setActionError('Could not find that user.'); return }
    setDepositBusy(true)
    const { error } = await supabase.from('deposits').insert({
      user_id: ownerProfile.id,
      username: depositForm.user,
      amount: Number(depositForm.amount),
      deposit_date: depositForm.date,
      notes: depositForm.notes.trim(),
    })
    setDepositBusy(false)
    if (error) setActionError(error.message)
    else { setActionError(null); setDepositForm({ user: '', amount: '', date: todayStr(), notes: '' }); reloadDeposits() }
  }

  async function deleteDeposit(id) {
    const { error } = await supabase.from('deposits').delete().eq('id', id)
    if (error) setActionError(error.message); else reloadDeposits()
  }

  const visibleTrades = useMemo(() => {
    return userFilter === 'ALL' ? trades : trades.filter(t => t.username === userFilter)
  }, [trades, userFilter])

  const stats = useMemo(() => {
    const open = trades.filter(t => t.status === 'OPEN').length
    const closed = trades.filter(t => t.status === 'CLOSED')
    const realized = closed.reduce((sum, t) => sum + (pnlFor(t) || 0), 0)
    const wins = closed.filter(t => (pnlFor(t) || 0) > 0).length
    const winRate = closed.length ? Math.round((wins / closed.length) * 100) : null
    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + Number(w.amount), 0)
    const totalDeposited = deposits.reduce((sum, d) => sum + Number(d.amount), 0)
    const totalPot = profiles.reduce((sum, p) => sum + Number(p.starting_pot ?? 0), 0) + realized + totalDeposited - totalWithdrawn
    return { open, closedCount: closed.length, realized, winRate, totalPot, totalWithdrawn, totalDeposited }
  }, [trades, profiles, withdrawals, deposits])

  const managedTrades = isAdmin ? trades : trades.filter(t => t.username === currentUser.username)

  async function handleAdd(e) {
    e.preventDefault()
    const ownerUsername = isAdmin ? form.user : currentUser.username
    if (!ownerUsername || !form.amount || !form.entryPrice) return
    const ownerProfile = profiles.find(p => p.username === ownerUsername)
    if (!ownerProfile) { setActionError('Could not find that user.'); return }
    const { error } = await supabase.from('trades').insert({
      user_id: ownerProfile.id,
      username: ownerUsername,
      side: form.side,
      amount: Number(form.amount),
      leverage: Number(form.leverage) || 1,
      entry_price: Number(form.entryPrice),
      entry_date: form.entryDate,
      notes: form.notes.trim(),
      status: 'OPEN',
    })
    if (error) setActionError(error.message)
    else { setActionError(null); setForm({ ...form, amount: '', leverage: '1', entryPrice: '', notes: '' }); reloadTrades() }
  }

  function openCloseModal(id) {
    setCloseForm({ movePercent: '', exitDate: todayStr(), fees: '' })
    setCloseModal(id)
  }

  async function handleCloseTrade(e) {
    e.preventDefault()
    if (closeForm.movePercent === '') return
    const trade = trades.find(t => t.id === closeModal)
    if (!trade) return
    const exitPrice = trade.entry_price * (1 + Number(closeForm.movePercent) / 100)
    const { error } = await supabase.from('trades')
      .update({ status: 'CLOSED', exit_price: exitPrice, exit_date: closeForm.exitDate, fees: Number(closeForm.fees) || 0 })
      .eq('id', closeModal)
    if (error) setActionError(error.message)
    else { setActionError(null); setCloseModal(null); reloadTrades() }
  }

  async function reopenTrade(id) {
    const { error } = await supabase.from('trades').update({ status: 'OPEN', exit_price: null, exit_date: null }).eq('id', id)
    if (error) setActionError(error.message); else reloadTrades()
  }

  async function deleteTrade(id) {
    const { error } = await supabase.from('trades').delete().eq('id', id)
    if (error) setActionError(error.message); else reloadTrades()
  }

  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState(null)

  function openEditModal(trade) {
    setEditForm({
      side: trade.side,
      amount: String(trade.amount),
      leverage: String(trade.leverage),
      entryPrice: String(trade.entry_price),
      entryDate: trade.entry_date,
      notes: trade.notes || '',
      exitPrice: trade.exit_price !== null ? String(trade.exit_price) : '',
      exitDate: trade.exit_date || todayStr(),
      fees: String(trade.fees ?? 0),
    })
    setEditModal(trade)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editModal) return
    const payload = {
      side: editForm.side,
      amount: Number(editForm.amount),
      leverage: Number(editForm.leverage) || 1,
      entry_price: Number(editForm.entryPrice),
      entry_date: editForm.entryDate,
      notes: editForm.notes.trim(),
    }
    if (editModal.status === 'CLOSED') {
      payload.exit_price = Number(editForm.exitPrice)
      payload.exit_date = editForm.exitDate
      payload.fees = Number(editForm.fees) || 0
    }
    const { error } = await supabase.from('trades').update(payload).eq('id', editModal.id)
    if (error) setActionError(error.message)
    else { setActionError(null); setEditModal(null); reloadTrades() }
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-inner">
          <div>
            <h1 className="title">LEDGER</h1>
            <p className="subtitle">{currentUser.username} <span style={{ color: '#4B5158' }}>· {currentUser.role}</span></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div className="stats-row">
              <div><div className="stat-label">{isAdmin ? 'TOTAL POT' : 'YOUR POT'}</div><div className="stat-value" style={{ color: '#E8A33D', fontSize: 16 }}>${fmt(stats.totalPot)}</div></div>
              <div><div className="stat-label">OPEN</div><div className="stat-value" style={{ color: '#3DDC84' }}>{stats.open}</div></div>
              <div><div className="stat-label">CLOSED</div><div className="stat-value">{stats.closedCount}</div></div>
              <div><div className="stat-label">REALIZED P&L</div><div className="stat-value" style={{ color: stats.realized >= 0 ? '#3DDC84' : '#E8574A' }}>{stats.realized >= 0 ? '+' : ''}{fmt(stats.realized)}</div></div>
              <div><div className="stat-label">WIN RATE</div><div className="stat-value">{stats.winRate === null ? '—' : `${stats.winRate}%`}</div></div>
            </div>
            <button className="btn" onClick={() => supabase.auth.signOut()}><LogOut size={12} /> LOG OUT</button>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>LEDGER</button>
        <button className={`tab-btn ${tab === 'live' ? 'active' : ''}`} onClick={() => setTab('live')}>LIVE</button>
        {isAdmin && (
          <button className={`tab-btn ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
            <Lock size={12} /> ADMIN
          </button>
        )}
      </div>

      <div className="content">
        {loadError && <div className="error-box">Could not load trades: {loadError}</div>}
        {actionError && <div className="error-box">{actionError}</div>}

        {tab === 'ledger' ? (
          <div>
            <div className="panel" style={{ marginBottom: 16 }}>
              <p className="panel-title">{isAdmin ? 'POTS BY USER' : 'YOUR POT'}</p>
              <div className="group-list">
                {userPots.map(p => (
                  <div key={p.id} className="group-row">
                    <span style={{ color: '#E8E6E1' }}>{p.username}</span>
                    <span className="mono" style={{ fontSize: 12 }}>
                      <span style={{ color: '#6B7280' }}>starting ${fmt(p.starting_pot)} · realized </span>
                      <span style={{ color: p.realized >= 0 ? '#3DDC84' : '#E8574A' }}>{p.realized >= 0 ? '+' : ''}${fmt(p.realized)}</span>
                      {p.deposited > 0 && (
                        <>
                          <span style={{ color: '#6B7280' }}> · deposited </span>
                          <span style={{ color: '#3DDC84' }}>+${fmt(p.deposited)}</span>
                        </>
                      )}
                      {p.withdrawn > 0 && (
                        <>
                          <span style={{ color: '#6B7280' }}> · withdrawn </span>
                          <span style={{ color: '#E8574A' }}>-${fmt(p.withdrawn)}</span>
                        </>
                      )}
                      <span style={{ color: '#6B7280' }}> · </span>
                      <span style={{ color: '#E8A33D' }}>pot ${fmt(p.pot)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 16 }}>
              <p className="panel-title">YOUR POT OVER TIME</p>
              {potHistory.length < 2 ? (
                <p className="empty" style={{ padding: '20px 0' }}>close a trade to start plotting your pot over time</p>
              ) : (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={potHistory} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#1B2027" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#2A2F36' }} tickLine={false} />
                      <YAxis tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#2A2F36' }} tickLine={false} width={60} tickFormatter={v => `$${fmt(v)}`} />
                      <Tooltip
                        contentStyle={{ background: '#0E1216', border: '1px solid #2A2F36', borderRadius: 3, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
                        labelStyle={{ color: '#6B7280' }}
                        formatter={(value) => [`$${fmt(value)}`, 'pot']}
                      />
                      <Line type="monotone" dataKey="pot" stroke="#E8A33D" strokeWidth={2} dot={{ r: 3, fill: '#E8A33D' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {(() => {
              const combined = [
                ...withdrawals.map(w => ({ ...w, kind: 'withdrawal', date: w.withdrawal_date })),
                ...deposits.map(d => ({ ...d, kind: 'deposit', date: d.deposit_date })),
              ]
              const relevant = (isAdmin ? combined : combined.filter(x => x.username === currentUser.username))
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              if (relevant.length === 0) return null
              return (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <p className="panel-title">{isAdmin ? 'FUND HISTORY' : 'YOUR FUND HISTORY'}</p>
                  <div className="group-list">
                    {relevant.map(x => (
                      <div key={`${x.kind}-${x.id}`} className="group-row">
                        <span>
                          <span style={{ color: '#E8E6E1' }}>{x.username}</span>
                          <span style={{ color: '#6B7280' }}> · {x.kind === 'deposit' ? 'deposit' : 'withdrawal'} · {x.date}{x.notes ? ` · ${x.notes}` : ''}</span>
                        </span>
                        <span style={{ color: x.kind === 'deposit' ? '#3DDC84' : '#E8574A' }}>{x.kind === 'deposit' ? '+' : '-'}${fmt(x.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            {isAdmin ? (
              <div className="filter-row">
                <span>USER</span>
                <select className="input" style={{ width: 'auto' }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                  {filterOptions.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            ) : (
              <p className="group-title" style={{ marginBottom: 8 }}>YOUR TRADES</p>
            )}
            {visibleTrades.length === 0 ? (
              <div className="empty">no trades logged yet</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>USER</th><th>SIDE</th>
                      <th className="right">AMOUNT ($)</th><th className="right">LEV</th><th className="right">ENTRY</th><th className="right">EXIT</th>
                      <th>STATUS</th><th className="right">FEES</th><th className="right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrades.map(t => {
                      const pnl = pnlFor(t)
                      return (
                        <tr key={t.id}>
                          <td>{t.username}</td>
                          <td>
                            <span className={`side ${t.side === 'LONG' ? 'long' : 'short'}`}>
                              {t.side === 'LONG' ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}{t.side}
                            </span>
                          </td>
                          <td className="right">${fmt(t.amount)}</td>
                          <td className="right">{t.leverage}×</td>
                          <td className="right">{fmt(t.entry_price)}</td>
                          <td className="right">{t.exit_price !== null ? fmt(t.exit_price) : '—'}</td>
                          <td>
                            <span className={`status-dot ${t.status === 'OPEN' ? 'open' : 'closed'}`}></span>
                            <span style={{ color: t.status === 'OPEN' ? '#3DDC84' : '#6B7280' }}>{t.status}</span>
                          </td>
                          <td className="right" style={{ color: '#6B7280' }}>{t.status === 'CLOSED' ? `$${fmt(t.fees)}` : '—'}</td>
                          <td className="right" style={{ color: pnl === null ? '#4B5158' : pnl >= 0 ? '#3DDC84' : '#E8574A' }}>
                            {pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}$${fmt(pnl)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : tab === 'live' ? (
          <div>
            <div className="panel" style={{ marginBottom: 16 }}>
              <p className="panel-title">
                <span className="status-dot open" style={{ marginRight: 6 }}></span>
                BTC/USDT LIVE
              </p>
              {priceError ? (
                <p className="error-text">{priceError}</p>
              ) : livePrice === null ? (
                <p className="empty" style={{ padding: '12px 0' }}>fetching live price…</p>
              ) : (
                <p className="mono" style={{ fontSize: 28, color: '#E8A33D', margin: 0 }}>${fmt(livePrice)}</p>
              )}
              <p style={{ fontSize: 10, color: '#4B5158', fontFamily: 'var(--mono)', marginTop: 8, marginBottom: 0 }}>
                updates every 5 seconds · for this to be meaningful, enter the real BTC/USDT price as your entry price when opening a trade
              </p>
            </div>

            <div className="panel" style={{ marginBottom: 16 }}>
              <p className="panel-title">BTC/USDT — 4H CHART</p>
              {candlesError ? (
                <p className="error-text">{candlesError}</p>
              ) : candles.length === 0 ? (
                <p className="empty" style={{ padding: '20px 0' }}>loading chart…</p>
              ) : (
                <div style={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={candles} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#1B2027" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })}
                        tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                        axisLine={{ stroke: '#2A2F36' }}
                        tickLine={false}
                        minTickGap={50}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                        axisLine={{ stroke: '#2A2F36' }}
                        tickLine={false}
                        width={70}
                        tickFormatter={v => `$${fmt(v)}`}
                      />
                      <Tooltip
                        contentStyle={{ background: '#0E1216', border: '1px solid #2A2F36', borderRadius: 3, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
                        labelFormatter={t => new Date(t).toLocaleString()}
                        formatter={(_value, _name, props) => {
                          const d = props.payload
                          return [`O ${fmt(d.open)}  H ${fmt(d.high)}  L ${fmt(d.low)}  C ${fmt(d.close)}`, '']
                        }}
                      />
                      <Bar dataKey={(d) => [d.low, d.high]} isAnimationActive={false} shape={CandleShape} />
                      {latestOpenTrades.map(t => (
                        <ReferenceLine
                          key={t.id}
                          y={t.entry_price}
                          stroke="#E8A33D"
                          strokeDasharray="4 4"
                          label={{ value: `${t.username} entry`, position: 'insideTopRight', fill: '#E8A33D', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="panel">
              <p className="panel-title">{isAdmin ? "LATEST OPEN TRADE PER USER" : "YOUR LATEST OPEN TRADE"}</p>
              {latestOpenTrades.length === 0 ? (
                <p className="empty" style={{ padding: '20px 0' }}>{isAdmin ? 'no open trades right now' : "you don't have an open trade right now"}</p>
              ) : (
                <div className="group-list">
                  {latestOpenTrades.map(t => {
                    const livePnl = livePnlFor(t, livePrice)
                    return (
                      <div key={t.id} className="group-row">
                        <span>
                          <span style={{ color: '#E8E6E1' }}>{t.username}</span>
                          <span className={`side ${t.side === 'LONG' ? 'long' : 'short'}`} style={{ marginLeft: 8 }}>
                            {t.side === 'LONG' ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}{t.side}
                          </span>
                          <span style={{ color: '#6B7280' }}> · ${fmt(t.amount)} · {t.leverage}× · entry {fmt(t.entry_price)}</span>
                        </span>
                        <span style={{ color: livePnl === null ? '#4B5158' : livePnl >= 0 ? '#3DDC84' : '#E8574A' }}>
                          {livePnl === null ? '—' : `${livePnl >= 0 ? '+' : ''}$${fmt(livePnl)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            {isAdmin && (
              <form className="panel" onSubmit={handleAddUser} style={{ marginBottom: 16 }}>
                <p className="panel-title"><UserPlus size={12} /> ADD USER</p>
                <div className="form-grid">
                  <div className="field">
                    <label>USERNAME</label>
                    <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>EMAIL</label>
                    <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>PASSWORD</label>
                    <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                </div>
                {newUserError && <p className="error-text" style={{ marginTop: 8 }}>{newUserError}</p>}
                {newUserSuccess && <p className="error-text" style={{ marginTop: 8, color: '#3DDC84' }}>{newUserSuccess}</p>}
                <button className="btn-primary" style={{ marginTop: 12 }} type="submit" disabled={newUserBusy}>CREATE ACCOUNT</button>
                <p style={{ fontSize: 10, color: '#4B5158', fontFamily: 'var(--mono)', marginTop: 8, marginBottom: 0 }}>
                  creates the account instantly, no email verification needed — give the new trader their email and password to log in
                </p>
              </form>
            )}
            {isAdmin && (
              <div className="panel" style={{ marginBottom: 16 }}>
                <p className="panel-title">STARTING POTS BY USER ($)</p>
                <div className="group-list">
                  {userPots.map(p => (
                    <div key={p.id} className="group-row">
                      <span style={{ color: '#E8E6E1' }}>{p.username}
                        <span style={{ color: '#6B7280' }}> · realized {p.realized >= 0 ? '+' : ''}${fmt(p.realized)} · pot ${fmt(p.pot)}</span>
                      </span>
                      <span className="row-actions">
                        <input
                          type="number" step="0.01"
                          value={potInputs[p.id] ?? ''}
                          onChange={e => setPotInputs({ ...potInputs, [p.id]: e.target.value })}
                          style={{ width: 100 }}
                          className="input"
                        />
                        <button type="button" className="btn-ghost-amber" disabled={potBusyId === p.id} onClick={() => savePot(p.id)}>SAVE</button>
                      </span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: '#4B5158', fontFamily: 'var(--mono)', marginTop: 10, marginBottom: 0 }}>
                  each trader's pot = their starting pot + their own realized P&L + deposits - withdrawals
                </p>
              </div>
            )}
            {isAdmin && (
              <form className="panel" onSubmit={handleDeposit} style={{ marginBottom: 16 }}>
                <p className="panel-title">ADD FUNDS</p>
                <div className="form-grid">
                  <div className="field">
                    <label>USER</label>
                    <select value={depositForm.user} onChange={e => setDepositForm({ ...depositForm, user: e.target.value })}>
                      <option value="">select…</option>
                      {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>AMOUNT ($)</label>
                    <input type="number" step="0.01" value={depositForm.amount} onChange={e => setDepositForm({ ...depositForm, amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>DATE</label>
                    <input type="date" value={depositForm.date} onChange={e => setDepositForm({ ...depositForm, date: e.target.value })} />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>NOTES</label>
                  <input value={depositForm.notes} onChange={e => setDepositForm({ ...depositForm, notes: e.target.value })} placeholder="optional" />
                </div>
                <button className="btn-primary" style={{ marginTop: 12 }} type="submit" disabled={depositBusy}>RECORD DEPOSIT</button>
                <p style={{ fontSize: 10, color: '#4B5158', fontFamily: 'var(--mono)', marginTop: 8, marginBottom: 0 }}>
                  adds the amount to that user's pot and shows up in their fund history
                </p>
                {deposits.length > 0 && (
                  <div className="group-list" style={{ marginTop: 16 }}>
                    {deposits.map(d => (
                      <div key={d.id} className="group-row">
                        <span>
                          <span style={{ color: '#E8E6E1' }}>{d.username}</span>
                          <span style={{ color: '#6B7280' }}> · {d.deposit_date} · +${fmt(d.amount)}{d.notes ? ` · ${d.notes}` : ''}</span>
                        </span>
                        <button type="button" className="icon-btn" onClick={() => deleteDeposit(d.id)}><Trash2 size={13} color="#6B7280" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            )}
            {isAdmin && (
              <form className="panel" onSubmit={handleWithdraw} style={{ marginBottom: 16 }}>
                <p className="panel-title">WITHDRAW PROFIT</p>
                <div className="form-grid">
                  <div className="field">
                    <label>USER</label>
                    <select value={withdrawForm.user} onChange={e => setWithdrawForm({ ...withdrawForm, user: e.target.value })}>
                      <option value="">select…</option>
                      {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>AMOUNT ($)</label>
                    <input type="number" step="0.01" value={withdrawForm.amount} onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>DATE</label>
                    <input type="date" value={withdrawForm.date} onChange={e => setWithdrawForm({ ...withdrawForm, date: e.target.value })} />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>NOTES</label>
                  <input value={withdrawForm.notes} onChange={e => setWithdrawForm({ ...withdrawForm, notes: e.target.value })} placeholder="optional" />
                </div>
                <button className="btn-primary" style={{ marginTop: 12 }} type="submit" disabled={withdrawBusy}>RECORD WITHDRAWAL</button>
                <p style={{ fontSize: 10, color: '#4B5158', fontFamily: 'var(--mono)', marginTop: 8, marginBottom: 0 }}>
                  knocks the amount off that user's pot and shows up in their withdrawal history
                </p>
                {withdrawals.length > 0 && (
                  <div className="group-list" style={{ marginTop: 16 }}>
                    {withdrawals.map(w => (
                      <div key={w.id} className="group-row">
                        <span>
                          <span style={{ color: '#E8E6E1' }}>{w.username}</span>
                          <span style={{ color: '#6B7280' }}> · {w.withdrawal_date} · -${fmt(w.amount)}{w.notes ? ` · ${w.notes}` : ''}</span>
                        </span>
                        <button type="button" className="icon-btn" onClick={() => deleteWithdrawal(w.id)}><Trash2 size={13} color="#6B7280" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            )}
            <form className="panel" onSubmit={handleAdd}>
              <p className="panel-title"><Plus size={12} /> ADD TRADE</p>
              <div className="form-grid">
                {isAdmin ? (
                  <div className="field">
                    <label>USER</label>
                    <select value={form.user} onChange={e => setForm({ ...form, user: e.target.value })}>
                      <option value="">select…</option>
                      {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label>USER</label>
                    <div className="field-static">{currentUser.username}</div>
                  </div>
                )}
                <div className="field">
                  <label>SIDE</label>
                  <select value={form.side} onChange={e => setForm({ ...form, side: e.target.value })}>
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                </div>
                <div className="field">
                  <label>AMOUNT ($)</label>
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label>LEVERAGE</label>
                  <input type="number" step="0.1" min="1" value={form.leverage} onChange={e => setForm({ ...form, leverage: e.target.value })} />
                </div>
                <div className="field">
                  <label>ENTRY PRICE</label>
                  <input type="number" value={form.entryPrice} onChange={e => setForm({ ...form, entryPrice: e.target.value })} />
                </div>
                <div className="field">
                  <label>ENTRY DATE</label>
                  <input type="date" value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} />
                </div>
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label>NOTES</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} type="submit">LOG TRADE</button>
            </form>

            <TradeGroup title="OPEN POSITIONS" trades={managedTrades.filter(t => t.status === 'OPEN')} onClose={openCloseModal} onDelete={deleteTrade} onEdit={openEditModal} />
            <TradeGroup title="CLOSED POSITIONS" trades={managedTrades.filter(t => t.status === 'CLOSED')} onReopen={reopenTrade} onDelete={deleteTrade} onEdit={openEditModal} closed />
          </div>
        )}
      </div>

      {closeModal && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={handleCloseTrade}>
            <div className="modal-head">
              <p className="panel-title" style={{ margin: 0 }}>CLOSE POSITION</p>
              <button type="button" className="icon-btn" onClick={() => setCloseModal(null)}><X size={14} color="#6B7280" /></button>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>RESULT (%)</label>
              <input autoFocus type="number" step="any" placeholder="e.g. 5 for a profit, -3.5 for a loss" value={closeForm.movePercent} onChange={e => setCloseForm({ ...closeForm, movePercent: e.target.value })} />
              {closeForm.movePercent !== '' && !isNaN(closeForm.movePercent) && closeModal && (
                (() => {
                  const trade = trades.find(t => t.id === closeModal)
                  if (!trade) return null
                  const pct = Number(closeForm.movePercent) / 100
                  const gross = trade.amount * (trade.leverage || 1) * pct
                  const previewPnl = gross - (Number(closeForm.fees) || 0)
                  return (
                    <p style={{ fontSize: 11, color: previewPnl >= 0 ? '#3DDC84' : '#E8574A', fontFamily: 'var(--mono)', marginTop: 6 }}>
                      P&L {previewPnl >= 0 ? '+' : ''}${fmt(previewPnl)}{Number(closeForm.fees) > 0 ? ` (after $${fmt(closeForm.fees)} fees)` : ''}
                    </p>
                  )
                })()
              )}
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>TRADING FEES ($)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={closeForm.fees} onChange={e => setCloseForm({ ...closeForm, fees: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>EXIT DATE</label>
              <input type="date" value={closeForm.exitDate} onChange={e => setCloseForm({ ...closeForm, exitDate: e.target.value })} />
            </div>
            <button className="btn-primary" style={{ width: '100%' }} type="submit">CONFIRM CLOSE</button>
          </form>
        </div>
      )}

      {editModal && editForm && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={handleSaveEdit} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <p className="panel-title" style={{ margin: 0 }}>EDIT TRADE — {editModal.username}</p>
              <button type="button" className="icon-btn" onClick={() => { setEditModal(null); setEditForm(null) }}><X size={14} color="#6B7280" /></button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>SIDE</label>
                <select value={editForm.side} onChange={e => setEditForm({ ...editForm, side: e.target.value })}>
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>
              <div className="field">
                <label>AMOUNT ($)</label>
                <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
              </div>
              <div className="field">
                <label>LEVERAGE</label>
                <input type="number" step="0.1" min="1" value={editForm.leverage} onChange={e => setEditForm({ ...editForm, leverage: e.target.value })} />
              </div>
              <div className="field">
                <label>ENTRY PRICE</label>
                <input type="number" step="any" value={editForm.entryPrice} onChange={e => setEditForm({ ...editForm, entryPrice: e.target.value })} />
              </div>
              <div className="field">
                <label>ENTRY DATE</label>
                <input type="date" value={editForm.entryDate} onChange={e => setEditForm({ ...editForm, entryDate: e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>NOTES</label>
              <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="optional" />
            </div>

            {editModal.status === 'CLOSED' && (
              <>
                <div className="form-grid" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>EXIT PRICE</label>
                    <input type="number" step="any" value={editForm.exitPrice} onChange={e => setEditForm({ ...editForm, exitPrice: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>EXIT DATE</label>
                    <input type="date" value={editForm.exitDate} onChange={e => setEditForm({ ...editForm, exitDate: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>FEES ($)</label>
                    <input type="number" step="0.01" min="0" value={editForm.fees} onChange={e => setEditForm({ ...editForm, fees: e.target.value })} />
                  </div>
                </div>
                {(() => {
                  const amt = Number(editForm.amount), lev = Number(editForm.leverage) || 1
                  const entry = Number(editForm.entryPrice), exit = Number(editForm.exitPrice)
                  if (!entry || isNaN(exit)) return null
                  const pctMove = (exit - entry) / entry
                  const previewPnl = amt * lev * pctMove - (Number(editForm.fees) || 0)
                  return (
                    <p style={{ fontSize: 11, color: previewPnl >= 0 ? '#3DDC84' : '#E8574A', fontFamily: 'var(--mono)', marginTop: 6 }}>
                      P&L {previewPnl >= 0 ? '+' : ''}${fmt(previewPnl)}
                    </p>
                  )
                })()}
              </>
            )}

            <button className="btn-primary" style={{ width: '100%', marginTop: 16 }} type="submit">SAVE CHANGES</button>
          </form>
        </div>
      )}
    </div>
  )
}

function TradeGroup({ title, trades, onClose, onReopen, onDelete, onEdit, closed }) {
  return (
    <div className="group">
      <p className="group-title">{title} ({trades.length})</p>
      {trades.length === 0 ? (
        <p className="empty" style={{ padding: '12px 0' }}>none</p>
      ) : (
        <div className="group-list">
          {trades.map(t => {
            const pnl = pnlFor(t)
            return (
              <div key={t.id} className="group-row">
                <span>
                  <span className={`status-dot ${t.status === 'OPEN' ? 'open' : 'closed'}`}></span>
                  <span style={{ color: '#E8E6E1' }}>{t.username}</span>
                  <span style={{ color: '#6B7280' }}> · {t.side} · ${fmt(t.amount)} · {t.leverage}× @ {fmt(t.entry_price)}{closed ? ` → ${fmt(t.exit_price)}` : ''}</span>
                  {closed && <span style={{ color: pnl >= 0 ? '#3DDC84' : '#E8574A' }}> · {pnl >= 0 ? '+' : ''}${fmt(pnl)}</span>}
                  {closed && Number(t.fees) > 0 && <span style={{ color: '#6B7280' }}> (fees ${fmt(t.fees)})</span>}
                </span>
                <span className="row-actions">
                  {closed ? (
                    <button className="btn-ghost-muted" onClick={() => onReopen(t.id)}>REOPEN</button>
                  ) : (
                    <button className="btn-ghost-amber" onClick={() => onClose(t.id)}>CLOSE</button>
                  )}
                  <button className="btn-ghost-muted" onClick={() => onEdit(t)}>EDIT</button>
                  <button className="icon-btn" onClick={() => onDelete(t.id)}><Trash2 size={13} color="#6B7280" /></button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
