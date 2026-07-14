import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Lock, X, Trash2, ArrowUpCircle, ArrowDownCircle, LogOut, UserPlus, KeyRound } from 'lucide-react'
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
  return t.amount * (t.leverage || 1) * pctMove
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null)
  const [trades, setTrades] = useState([])
  const [profiles, setProfiles] = useState([])
  const [tab, setTab] = useState('ledger')
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
    (async () => {
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

  useEffect(() => {
    if (!session) return
    loadTrades()
    loadProfiles()
    // live updates so all logged-in users see changes without refreshing
    const channel = supabase
      .channel('trades-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => loadTrades())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadProfiles())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, loadTrades, loadProfiles])

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

function MainApp({ currentUser, profiles, trades, reloadTrades, reloadProfiles, tab, setTab, userFilter, setUserFilter, loadError }) {
  const isAdmin = currentUser.role === 'admin'
  const [potInputs, setPotInputs] = useState({})
  const [potBusyId, setPotBusyId] = useState(null)

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
    return profiles.map(p => ({
      ...p,
      realized: realizedByUser[p.username] || 0,
      pot: Number(p.starting_pot ?? 0) + (realizedByUser[p.username] || 0),
    })).sort((a, b) => a.username.localeCompare(b.username))
  }, [profiles, trades])

  const [form, setForm] = useState({ user: isAdmin ? '' : currentUser.username, side: 'LONG', amount: '', leverage: '1', entryPrice: '', entryDate: todayStr(), notes: '' })
  const [closeModal, setCloseModal] = useState(null)
  const [closeForm, setCloseForm] = useState({ movePercent: '', exitDate: todayStr() })
  const [actionError, setActionError] = useState(null)

  const visibleTrades = useMemo(() => {
    return userFilter === 'ALL' ? trades : trades.filter(t => t.username === userFilter)
  }, [trades, userFilter])

  const stats = useMemo(() => {
    const open = trades.filter(t => t.status === 'OPEN').length
    const closed = trades.filter(t => t.status === 'CLOSED')
    const realized = closed.reduce((sum, t) => sum + (pnlFor(t) || 0), 0)
    const wins = closed.filter(t => (pnlFor(t) || 0) > 0).length
    const winRate = closed.length ? Math.round((wins / closed.length) * 100) : null
    const totalPot = profiles.reduce((sum, p) => sum + Number(p.starting_pot ?? 0), 0) + realized
    return { open, closedCount: closed.length, realized, winRate, totalPot }
  }, [trades, profiles])

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
    setCloseForm({ movePercent: '', exitDate: todayStr() })
    setCloseModal(id)
  }

  async function handleCloseTrade(e) {
    e.preventDefault()
    if (closeForm.movePercent === '') return
    const trade = trades.find(t => t.id === closeModal)
    if (!trade) return
    const exitPrice = trade.entry_price * (1 + Number(closeForm.movePercent) / 100)
    const { error } = await supabase.from('trades')
      .update({ status: 'CLOSED', exit_price: exitPrice, exit_date: closeForm.exitDate })
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
        <button className={`tab-btn ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
          <Lock size={12} /> {isAdmin ? 'ADMIN' : 'MY TRADES'}
        </button>
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
                      <span style={{ color: '#6B7280' }}> · </span>
                      <span style={{ color: '#E8A33D' }}>pot ${fmt(p.pot)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
                      <th>STATUS</th><th className="right">P&L</th>
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
                  each trader's pot = their starting pot + their own realized P&L
                </p>
              </div>
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

            <TradeGroup title="OPEN POSITIONS" trades={managedTrades.filter(t => t.status === 'OPEN')} onClose={openCloseModal} onDelete={deleteTrade} />
            <TradeGroup title="CLOSED POSITIONS" trades={managedTrades.filter(t => t.status === 'CLOSED')} onReopen={reopenTrade} onDelete={deleteTrade} closed />
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
                  const previewPnl = trade.amount * (trade.leverage || 1) * pct
                  return (
                    <p style={{ fontSize: 11, color: previewPnl >= 0 ? '#3DDC84' : '#E8574A', fontFamily: 'var(--mono)', marginTop: 6 }}>
                      P&L {previewPnl >= 0 ? '+' : ''}${fmt(previewPnl)}
                    </p>
                  )
                })()
              )}
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>EXIT DATE</label>
              <input type="date" value={closeForm.exitDate} onChange={e => setCloseForm({ ...closeForm, exitDate: e.target.value })} />
            </div>
            <button className="btn-primary" style={{ width: '100%' }} type="submit">CONFIRM CLOSE</button>
          </form>
        </div>
      )}
    </div>
  )
}

function TradeGroup({ title, trades, onClose, onReopen, onDelete, closed }) {
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
                </span>
                <span className="row-actions">
                  {closed ? (
                    <button className="btn-ghost-muted" onClick={() => onReopen(t.id)}>REOPEN</button>
                  ) : (
                    <button className="btn-ghost-amber" onClick={() => onClose(t.id)}>CLOSE</button>
                  )}
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
