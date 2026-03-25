import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import Navbar from '../components/Navbar';
import {
  Users, Globe, Activity, Trash2, Shield, ShieldOff, UserPlus,
  Plus, Loader2, ArrowLeft, CreditCard, ScrollText, KeyRound,
  LayoutList, Clock, MapPin, Server, RefreshCw, Wifi, WifiOff, CheckCircle2,
  Play, Square, RotateCcw, Power, Edit3, Zap
} from 'lucide-react';

import { Radio, Link2, Tag, ShieldCheck } from 'lucide-react';

const TABS = [
  { id: 'proxies', label: 'Proxies', icon: Globe },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'domains', label: 'Domains', icon: Link2 },
  { id: 'streams', label: 'Streams', icon: Radio },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'plans', label: 'Plans', icon: Tag },
  { id: 'credits', label: 'Credits', icon: CreditCard },
  { id: 'activity', label: 'Activity', icon: ScrollText },
];

export default function Admin() {
  const [tab, setTab] = useState('proxies');
  const [users, setUsers] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [stats, setStats] = useState(null);
  const [creditHistory, setCreditHistory] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [servers, setServers] = useState([]);
  const [streamRequests, setStreamRequests] = useState([]);
  const [adminDomains, setAdminDomains] = useState([]);
  const [newDomain, setNewDomain] = useState('');
  const [serverConns, setServerConns] = useState({});
  const [regOpen, setRegOpen] = useState(true);
  const [createUserModal, setCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', credits: '0' });
  const [loading, setLoading] = useState(true);
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [passwordModal, setPasswordModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [serverModal, setServerModal] = useState(false);
  const [editServerModal, setEditServerModal] = useState(null);
  const [serverForm, setServerForm] = useState({ ip: '', ssh_port: '22', username: 'root', password: '', country: 'US', label: '', max_connections: '100', bandwidth_limit: '1Gbps' });
  const [serverInstalling, setServerInstalling] = useState(false);
  const [streamPlans, setStreamPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [planModal, setPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', type: 'streaming', speed_mbps: '1000', price_eur: '99', description: '' });
  const [liveStats, setLiveStats] = useState({ active_users: 0, bandwidth_mbps: '0', requests_per_sec: 0 });
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io({ path: '/ws', transports: ['websocket', 'polling'] });
    socket.on('stats', (data) => setLiveStats(data));
    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  useEffect(() => { loadData(); }, []);

  const [proxyConns, setProxyConns] = useState({});

  useEffect(() => {
    if (tab !== 'servers' && tab !== 'proxies' && tab !== 'streams') return;
    const fetchConns = async () => {
      try {
        const res = await fetch('/api/server-connections');
        if (res.ok) {
          const data = await res.json();
          setServerConns(data.servers || {});
          setProxyConns(data.proxies || {});
        }
      } catch {}
    };
    fetchConns();
    const interval = setInterval(fetchConns, 5000);
    return () => clearInterval(interval);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'servers' || servers.length === 0) return;
    const fetchUptimes = () => {
      servers.forEach(s => {
        fetch(`/api/admin/servers/${s.id}/uptime`).then(r => r.json()).then(d => {
          setServerUptimes(prev => ({ ...prev, [s.id]: d }));
        }).catch(() => {});
      });
    };
    fetchUptimes();
    const interval = setInterval(fetchUptimes, 10000);
    return () => clearInterval(interval);
  }, [tab, servers.length]);

  const loadData = async () => {
    try {
      const [uRes, pRes, sRes, chRes, alRes, svRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/proxies'),
        fetch('/api/admin/stats'),
        fetch('/api/admin/credit-history'),
        fetch('/api/admin/activity-log'),
        fetch('/api/admin/servers'),
      ]);
      if (uRes.ok) setUsers((await uRes.json()).users);
      if (pRes.ok) setProxies((await pRes.json()).proxies);
      if (sRes.ok) setStats((await sRes.json()).stats);
      if (chRes.ok) setCreditHistory((await chRes.json()).history);
      if (alRes.ok) setActivityLogs((await alRes.json()).logs);
      if (svRes.ok) setServers((await svRes.json()).servers);
      const srRes = await fetch('/api/admin/stream-requests');
      if (srRes.ok) setStreamRequests((await srRes.json()).requests);
      const scRes = await fetch('/api/server-connections');
      if (scRes.ok) setServerConns((await scRes.json()).connections || {});
      const dmRes = await fetch('/api/admin/domains');
      if (dmRes.ok) setAdminDomains((await dmRes.json()).domains);
      const setRes = await fetch('/api/admin/settings');
      if (setRes.ok) { const d = await setRes.json(); setRegOpen(d.registration_open); }
      const plRes = await fetch('/api/admin/stream-plans');
      if (plRes.ok) setStreamPlans((await plRes.json()).plans);
      const subRes = await fetch('/api/admin/subscriptions');
      if (subRes.ok) setSubscriptions((await subRes.json()).subscriptions);
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user and all their proxies?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) { setUsers(prev => prev.filter(u => u.id !== id)); loadData(); }
  };

  const toggleAdmin = async (id, currentAdmin) => {
    const res = await fetch(`/api/admin/users/${id}/admin`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: !currentAdmin }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_admin: data.user.is_admin, role: data.user.role } : u));
    }
  };

  const changeRole = async (id, role) => {
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(u => u.id === id ? data.user : u));
      showToast(`Role changed to ${role}`);
    }
  };

  const saveResellerLimits = async (id, limits) => {
    const res = await fetch(`/api/admin/users/${id}/reseller-limits`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(limits),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(u => u.id === id ? data.user : u));
      showToast('Reseller limits saved');
    }
  };

  const addCredits = async () => {
    if (!creditModal || !creditAmount) return;
    const res = await fetch(`/api/admin/users/${creditModal.id}/credits`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseInt(creditAmount) }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(u => u.id === creditModal.id ? { ...u, credits: data.user.credits } : u));
      setCreditModal(null);
      setCreditAmount('');
      loadData();
    }
  };

  const changePassword = async () => {
    if (!passwordModal || !newPassword || newPassword.length < 6) return;
    const res = await fetch(`/api/admin/users/${passwordModal.id}/password`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      showToast(`Password updated for ${passwordModal.username}`, 'success');
      setPasswordModal(null);
      setNewPassword('');
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to change password', 'error');
    }
  };

  const addServer = async () => {
    if (!serverForm.ip || !serverForm.password || !serverForm.country) return;
    setServerInstalling(true);
    try {
      const res = await fetch('/api/admin/servers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverForm),
      });
      if (res.ok) {
        setServerModal(false);
        setServerForm({ ip: '', ssh_port: '22', username: 'root', password: '', country: 'US', label: '', max_connections: '100', bandwidth_limit: '1Gbps' });
        loadData();
        setTimeout(loadData, 30000);
        setTimeout(loadData, 60000);
        setTimeout(loadData, 120000);
      }
    } catch (err) { console.error(err); }
    finally { setServerInstalling(false); }
  };

  const [checkingServer, setCheckingServer] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const checkServerHealth = async (id) => {
    setCheckingServer(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}/check`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const responding = data.check_result === 'responding';
        showToast(
          responding ? `Server is online and responding` : `Server check: not responding (status unchanged)`,
          responding ? 'success' : 'error'
        );
        loadData();
      }
    } catch {
      showToast('Health check request failed', 'error');
    } finally {
      setCheckingServer(null);
    }
  };

  const approveStream = async (id) => {
    const res = await fetch(`/api/admin/proxies/${id}/approve-stream`, { method: 'POST' });
    if (res.ok) loadData();
  };

  const denyStream = async (id) => {
    const res = await fetch(`/api/admin/proxies/${id}/deny-stream`, { method: 'POST' });
    if (res.ok) loadData();
  };

  const addDomain = async () => {
    if (!newDomain) return;
    const res = await fetch('/api/admin/domains', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: newDomain }),
    });
    if (res.ok) { setNewDomain(''); loadData(); }
    else { const d = await res.json(); alert(d.error || 'Failed'); }
  };

  const deleteDomainItem = async (id) => {
    if (!confirm('Delete this domain?')) return;
    const res = await fetch(`/api/admin/domains/${id}`, { method: 'DELETE' });
    if (res.ok) setAdminDomains(prev => prev.filter(d => d.id !== id));
  };

  const toggleDomainItem = async (id) => {
    await fetch(`/api/admin/domains/${id}/toggle`, { method: 'PATCH' });
    loadData();
  };

  const toggleRegistration = async () => {
    const res = await fetch('/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'registration_open', value: !regOpen }),
    });
    if (res.ok) setRegOpen(!regOpen);
  };

  const createUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) return;
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, credits: parseInt(newUser.credits) || 0 }),
    });
    if (res.ok) {
      setCreateUserModal(false);
      setNewUser({ username: '', email: '', password: '', credits: '0' });
      loadData();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to create user');
    }
  };

  const [serverAction, setServerAction] = useState(null);
  const [serverUptimes, setServerUptimes] = useState({});

  const serverCommand = async (id, action, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setServerAction(`${id}-${action}`);
    try {
      const res = await fetch(`/api/admin/servers/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
      } else {
        showToast(data.error || `${action} failed`, 'error');
      }
      loadData();
    } catch {
      showToast(`${action} request failed`, 'error');
    } finally {
      setServerAction(null);
    }
  };

  const saveServerEdit = async () => {
    if (!editServerModal) return;
    const res = await fetch(`/api/admin/servers/${editServerModal.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editServerModal),
    });
    if (res.ok) {
      showToast('Server updated', 'success');
      setEditServerModal(null);
      loadData();
    } else {
      showToast('Update failed', 'error');
    }
  };

  const deleteServerItem = async (id) => {
    if (!confirm('Delete this server?')) return;
    const res = await fetch(`/api/admin/servers/${id}`, { method: 'DELETE' });
    if (res.ok) setServers(prev => prev.filter(s => s.id !== id));
  };

  const deleteProxy = async (id) => {
    if (!confirm('Delete this proxy?')) return;
    const res = await fetch(`/api/admin/proxies/${id}`, { method: 'DELETE' });
    if (res.ok) { setProxies(prev => prev.filter(p => p.id !== id)); loadData(); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="flex pt-16 min-h-screen">

        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-white/[0.06] bg-[#07070d] p-4 pt-8 hidden md:block">
          <Link to="/dashboard" className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-6 px-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold px-3 mb-3">Admin Panel</p>
          <nav className="space-y-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all ${tab === t.id ? 'bg-white/[0.06] text-cyan-400 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </nav>

          {/* Registration Toggle */}
          <div className="mt-6 px-1">
            <button onClick={toggleRegistration}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all ${regOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <span>Registration</span>
              <span className="text-[10px] font-bold uppercase">{regOpen ? 'Open' : 'Closed'}</span>
            </button>
          </div>

          {/* Stats in sidebar */}
          <div className="mt-4 space-y-3 px-1">
            <div className="glass rounded-lg p-3">
              <p className="text-xl font-bold text-slate-100">{stats?.total_users || 0}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Users</p>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-xl font-bold text-slate-100">{stats?.total_proxies || 0}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Proxies</p>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-xl font-bold text-slate-100">{(stats?.total_requests || 0).toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Requests</p>
            </div>
          </div>
        </aside>

        {/* Mobile tab bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/[0.06] flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] transition-colors ${tab === t.id ? 'text-cyan-400' : 'text-slate-500'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8 pb-24 md:pb-8 overflow-x-auto">

          {/* Live Stats Bar */}
          <div className="glass rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-500 uppercase tracking-wider">Live</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="text-lg font-bold text-slate-100">{liveStats.active_users}</span>
                <span className="text-xs text-slate-500">active</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-lg font-bold text-slate-100">{liveStats.bandwidth_mbps}</span>
                <span className="text-xs text-slate-500">Mbps</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-lg font-bold text-slate-100">{liveStats.requests_per_sec}</span>
                <span className="text-xs text-slate-500">req/s</span>
              </div>
            </div>
          </div>

          {/* Proxies Tab */}
          {tab === 'proxies' && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-6">All Proxies</h2>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Subdomain', 'Target', 'Owner', 'Conn', 'BW Used', 'Requests', 'Status', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {proxies.map(p => {
                        const conn = proxyConns[p.id] || 0;
                        const bw = p.bandwidth_used || 0;
                        const bwDisplay = bw > 1073741824 ? `${(bw/1073741824).toFixed(1)} GB` : `${(bw/1048576).toFixed(1)} MB`;
                        return (
                        <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-3">
                            <div className="text-cyan-400 font-mono text-xs">{p.subdomain}</div>
                            <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" /> {p.country || 'auto'}
                              {p.stream_proxy === 2 && <span className="text-purple-400 ml-1">STREAM</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-400 font-mono text-[10px] max-w-[150px] truncate">{p.target_url}</td>
                          <td className="px-3 py-3 text-slate-300 text-xs">{p.owner_username || '-'}</td>
                          <td className="px-3 py-3">
                            <span className={`text-xs font-bold ${conn > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{conn}</span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-400">{bwDisplay}</td>
                          <td className="px-3 py-3 text-slate-400 text-xs">{p.requests_count.toLocaleString()}</td>
                          <td className="px-3 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${p.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/[0.03]'}`}>
                              {p.is_active ? 'Active' : 'Paused'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button onClick={() => deleteProxy(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {proxies.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No proxies yet</div>}
              </div>
            </div>
          )}

          {/* Users Tab */}
          {tab === 'users' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-100">All Users</h2>
                <button onClick={() => setCreateUserModal(true)} className="btn-primary text-xs flex items-center gap-2" style={{ padding: '0.5rem 1rem' }}>
                  <Plus className="w-3.5 h-3.5" /> Create User
                </button>
              </div>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['ID', 'Username', 'Email', 'Credits', 'Role', 'Joined', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-slate-600 font-mono text-xs">{u.id}</td>
                          <td className="px-4 py-3 text-slate-200 font-medium text-xs">{u.username}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{u.email}</td>
                          <td className="px-4 py-3 text-cyan-400 font-semibold text-xs">{u.credits}</td>
                          <td className="px-4 py-3">
                            <select value={u.role || 'user'} onChange={e => changeRole(u.id, e.target.value)}
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-transparent border-0 cursor-pointer ${
                                u.role === 'admin' ? 'text-amber-400' : u.role === 'reseller' ? 'text-purple-400' : 'text-slate-500'
                              }`}>
                              <option value="user" className="bg-[#0a0a14] text-slate-300">User</option>
                              <option value="reseller" className="bg-[#0a0a14] text-purple-400">Reseller</option>
                              <option value="admin" className="bg-[#0a0a14] text-amber-400">Admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setPasswordModal(u); setNewPassword(''); }} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400 transition-all" title="Change Password">
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { setCreditModal(u); setCreditAmount(''); }} className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400 transition-all" title="Add Credits">
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteUser(u.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {users.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No users yet</div>}
              </div>
            </div>
          )}

          {/* Credit History Tab */}
          {tab === 'credits' && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-6">Credit History</h2>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Date', 'Username', 'Amount', 'Balance After', 'Action', 'Detail'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {creditHistory.map(ch => (
                        <tr key={ch.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs">{new Date(ch.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{ch.username}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${ch.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {ch.amount > 0 ? `+${ch.amount}` : ch.amount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-cyan-400 font-semibold text-xs">{ch.balance_after}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${ch.action === 'admin_added' ? 'text-emerald-400 bg-emerald-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                              {ch.action === 'admin_added' ? 'Added' : 'Used'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{ch.detail || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {creditHistory.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No credit transactions yet</div>}
              </div>
            </div>
          )}

          {/* Activity Log Tab */}
          {tab === 'activity' && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-6">Activity Log</h2>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Date', 'Username', 'IP', 'Module', 'Operation', 'Detail'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map(log => (
                        <tr key={log.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{log.username || '-'}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{log.ip_address || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full text-blue-400 bg-blue-500/10">{log.module}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full text-purple-400 bg-purple-500/10">{log.operation}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[250px] truncate">{log.detail || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activityLogs.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No activity yet</div>}
              </div>
            </div>
          )}

          {/* Plans Tab */}
          {tab === 'plans' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-100">Stream Plans</h2>
                <button onClick={() => { setPlanForm({ name: '', type: 'streaming', speed_mbps: '1000', price_eur: '99', description: '' }); setPlanModal(true); }}
                  className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> Add Plan</button>
              </div>

              {planModal && (
                <div className="glass rounded-xl p-6 mb-6 border border-cyan-500/10">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Create Plan</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <input value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} placeholder="Plan name"
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                    <select value={planForm.type} onChange={e => setPlanForm({...planForm, type: e.target.value})}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200">
                      <option value="streaming">Streaming</option>
                      <option value="enterprise">Enterprise</option>
                      <option value="reseller">Reseller</option>
                    </select>
                    <input value={planForm.speed_mbps} onChange={e => setPlanForm({...planForm, speed_mbps: e.target.value})} placeholder="Speed (Mbps)" type="number"
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                    <input value={planForm.price_eur} onChange={e => setPlanForm({...planForm, price_eur: e.target.value})} placeholder="Price EUR" type="number" step="0.01"
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                    <input value={planForm.description} onChange={e => setPlanForm({...planForm, description: e.target.value})} placeholder="Description"
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={async () => {
                      const r = await fetch('/api/admin/stream-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(planForm) });
                      if (r.ok) { setPlanModal(false); loadData(); showToast('Plan created'); }
                      else { const d = await r.json(); showToast(d.error, 'error'); }
                    }} className="btn-primary text-sm">Create</button>
                    <button onClick={() => setPlanModal(false)} className="btn-secondary text-sm">Cancel</button>
                  </div>
                </div>
              )}

              <div className="glass rounded-xl overflow-hidden mb-8">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/[0.06]">
                      {['Name', 'Type', 'Speed', 'Price', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {streamPlans.map(p => (
                        <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-slate-200 font-medium text-xs">{p.name}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              p.type === 'enterprise' ? 'text-amber-400 bg-amber-500/10' : p.type === 'reseller' ? 'text-purple-400 bg-purple-500/10' : 'text-cyan-400 bg-cyan-500/10'
                            }`}>{p.type}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{(p.speed_mbps / 1000).toFixed(0)} Gbps</td>
                          <td className="px-4 py-3 text-emerald-400 font-semibold text-xs">{p.price_eur} EUR</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                              {p.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={async () => {
                                await fetch(`/api/admin/stream-plans/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ is_active: !p.is_active }) });
                                loadData();
                              }} className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400 transition-all" title="Toggle">
                                {p.is_active ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={async () => {
                                if (!confirm(`Delete plan "${p.name}"?`)) return;
                                await fetch(`/api/admin/stream-plans/${p.id}`, { method: 'DELETE' });
                                loadData();
                              }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-100 mb-4">Active Subscriptions</h3>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/[0.06]">
                      {['User', 'Plan', 'Speed', 'Status', 'Expires', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {subscriptions.map(s => (
                        <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-slate-200 font-medium text-xs">{s.username}</td>
                          <td className="px-4 py-3 text-cyan-400 text-xs">{s.plan_name}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{(s.speed_mbps / 1000).toFixed(0)} Gbps</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              s.status === 'active' ? 'text-emerald-400 bg-emerald-500/10' : s.status === 'cancelled' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10'
                            }`}>{s.status}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '-'}</td>
                          <td className="px-4 py-3">
                            {s.status === 'active' && (
                              <button onClick={async () => {
                                if (!confirm('Cancel this subscription?')) return;
                                await fetch(`/api/admin/subscriptions/${s.id}/cancel`, { method: 'POST' });
                                loadData(); showToast('Subscription cancelled');
                              }} className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] hover:bg-red-500/20">Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {subscriptions.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600 text-sm">No subscriptions</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Domains Tab */}
          {tab === 'domains' && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-6">Proxy Domains</h2>
              <div className="glass rounded-xl p-4 mb-6">
                <p className="text-xs text-slate-400 mb-4">
                  Add additional domains for proxy subdomains. Users can choose which domain to use when creating a proxy.
                  Each domain needs DNS A record + wildcard A record pointing to your server, plus wildcard SSL certificate.
                </p>
                <div className="flex gap-2">
                  <input className="input-field text-xs flex-1" placeholder="proxy-network.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} />
                  <button onClick={addDomain} className="btn-primary text-xs flex items-center gap-1.5" style={{ padding: '0.5rem 1rem' }}>
                    <Plus className="w-3.5 h-3.5" /> Add Domain
                  </button>
                </div>
              </div>

              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['ID', 'Domain', 'Status', 'Added', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adminDomains.map(d => (
                        <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-slate-600 font-mono text-xs">{d.id}</td>
                          <td className="px-4 py-3 text-cyan-400 font-mono text-xs">{d.domain}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${d.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/[0.03]'}`}>
                              {d.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => toggleDomainItem(d.id)} className={`p-1.5 rounded-lg transition-all ${d.is_active ? 'hover:bg-amber-500/10 text-slate-600 hover:text-amber-400' : 'hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400'}`} title="Toggle">
                                {d.is_active ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => deleteDomainItem(d.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {adminDomains.length === 0 && (
                  <div className="text-center py-10 text-slate-600 text-sm">
                    No additional domains. The default domain from .env is always available.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stream Requests Tab */}
          {tab === 'streams' && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-6">Stream Proxy Requests</h2>
              <div className="glass rounded-xl p-4 mb-6">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Users can request Stream Proxy mode for their proxies. When approved, ProxyXPass will rewrite all URLs in API/M3U responses 
                  to hide the real backend IP. This uses significant bandwidth - only approve for users with dedicated high-bandwidth servers.
                </p>
              </div>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Subdomain', 'Target', 'Owner', 'Used', 'Limit', 'Status', 'Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {streamRequests.map(sr => (
                        <tr key={sr.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-cyan-400 font-mono text-xs">{sr.subdomain}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[180px] truncate">{sr.target_url}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{sr.owner_username || '-'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {(sr.bandwidth_used || 0) > 1073741824 ? `${((sr.bandwidth_used || 0) / 1073741824).toFixed(1)} GB` : `${((sr.bandwidth_used || 0) / 1048576).toFixed(1)} MB`}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {sr.stream_proxy === 2 ? (
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" placeholder="0"
                                  id={`bwl-${sr.id}`}
                                  key={`bw-${sr.id}-${sr.bandwidth_limit}`}
                                  className="input-field text-xs w-16" style={{ padding: '0.25rem 0.5rem' }}
                                  defaultValue={sr.bandwidth_limit || 0}
                                />
                                <span className="text-[10px] text-slate-600">Mbps</span>
                                <button onClick={async () => {
                                  const val = parseInt(document.getElementById(`bwl-${sr.id}`).value) || 0;
                                  await fetch(`/api/admin/proxies/${sr.id}/bandwidth-limit`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ limit_mbps: val }),
                                  });
                                  showToast(`Bandwidth limit set to ${val} Mbps`, 'success');
                                  loadData();
                                }} className="p-1 rounded hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400 transition-all" title="Save">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : <span className="text-slate-600">-</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              sr.stream_proxy === 1 ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10'
                            }`}>
                              {sr.stream_proxy === 1 ? 'Pending' : 'Approved'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {sr.stream_proxy === 1 && (
                                <>
                                  <button onClick={() => approveStream(sr.id)} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/20 transition-all">
                                    Approve
                                  </button>
                                  <button onClick={() => denyStream(sr.id)} className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold hover:bg-red-500/20 transition-all">
                                    Deny
                                  </button>
                                </>
                              )}
                              {sr.stream_proxy === 2 && (
                                <button onClick={() => denyStream(sr.id)} className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold hover:bg-red-500/20 transition-all">
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {streamRequests.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No pending stream proxy requests</div>}
              </div>
            </div>
          )}

          {/* Servers Tab */}
          {tab === 'servers' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-100">Proxy Servers</h2>
                <button onClick={() => setServerModal(true)} className="btn-primary text-xs flex items-center gap-2" style={{ padding: '0.5rem 1rem' }}>
                  <Plus className="w-3.5 h-3.5" /> Add Server
                </button>
              </div>

              <div className="glass rounded-xl p-4 mb-6">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Add VPS servers as proxy nodes. The system will auto-install the ProxyXPass Node Agent via SSH.
                  Each node handles proxy traffic using its own bandwidth. DNS records are auto-created when users select a country with an available node.
                </p>
              </div>

              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['ID', 'IP', 'Country', 'Label', 'Type', 'Usage', 'Max', 'Uptime', 'Status', ''].map(h => (
                          <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map(s => (
                        <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-3 text-slate-600 font-mono text-xs">{s.id}</td>
                          <td className="px-3 py-3 text-cyan-400 font-mono text-xs">{s.ip}:{s.port}</td>
                          <td className="px-3 py-3 text-slate-300 text-xs">{s.country}</td>
                          <td className="px-3 py-3 text-slate-400 text-xs">{s.label || '-'}</td>
                          <td className="px-3 py-3">
                            {(() => {
                              let currentTypes = [];
                              try { currentTypes = JSON.parse(s.server_type); } catch {}
                              if (!Array.isArray(currentTypes)) currentTypes = s.server_type === 'all' ? ['all'] : [s.server_type || 'all'];
                              const toggleType = async (t) => {
                                let next;
                                if (t === 'all') {
                                  next = ['all'];
                                } else {
                                  let arr = currentTypes.filter(x => x !== 'all');
                                  if (arr.includes(t)) arr = arr.filter(x => x !== t);
                                  else arr.push(t);
                                  next = arr.length === 0 ? ['all'] : arr;
                                }
                                await fetch(`/api/admin/servers/${s.id}/server-type`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ types: next }),
                                });
                                loadData();
                              };
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {['all', 'dns', 'stream', 'enterprise'].map(t => (
                                    <button key={t} onClick={() => toggleType(t)}
                                      className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded transition-all ${
                                        currentTypes.includes(t)
                                          ? t === 'all' ? 'bg-slate-500/20 text-slate-300'
                                          : t === 'dns' ? 'bg-blue-500/20 text-blue-400'
                                          : t === 'stream' ? 'bg-purple-500/20 text-purple-400'
                                          : 'bg-amber-500/20 text-amber-400'
                                        : 'bg-white/[0.03] text-slate-600 hover:text-slate-400'
                                      }`}>
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-3">
                            {(() => {
                              const active = serverConns[s.id] || 0;
                              const max = s.max_connections || 100;
                              const pct = Math.min(100, (active / max) * 100);
                              return (
                                <div className="w-24">
                                  <div className="flex items-center justify-between text-[10px] mb-1">
                                    <span className={`font-semibold ${pct > 80 ? 'text-red-400' : pct > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>{active}</span>
                                    <span className="text-slate-600">/ {max}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                      style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <input type="number" min="1" className="input-field text-xs w-16" style={{ padding: '0.2rem 0.4rem' }}
                                id={`mc-${s.id}`}
                                key={`mc-${s.id}-${s.max_connections}`}
                                defaultValue={s.max_connections || 100}
                              />
                              <button onClick={async () => {
                                const val = parseInt(document.getElementById(`mc-${s.id}`).value) || 100;
                                await fetch(`/api/admin/servers/${s.id}/max-connections`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ max: val }),
                                });
                                showToast(`Max connections set to ${val}`, 'success');
                                loadData();
                              }} className="p-1 rounded hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400 transition-all" title="Save">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {serverUptimes[s.id] ? (
                              <div className="space-y-0.5">
                                <p className="text-slate-400 text-[10px]">{serverUptimes[s.id].server_uptime}</p>
                                <p className="text-[10px] text-slate-600">Squid: {serverUptimes[s.id].squid_uptime}</p>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="text-cyan-400">CPU {serverUptimes[s.id].cpu}</span>
                                  <span className="text-amber-400">RAM {serverUptimes[s.id].ram}</span>
                                  <span className="text-slate-500">Disk {serverUptimes[s.id].disk}</span>
                                </div>
                              </div>
                            ) : <span className="text-slate-600 text-[10px]">loading...</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              s.status === 'online' ? 'text-emerald-400 bg-emerald-500/10' :
                              s.status === 'installing' ? 'text-amber-400 bg-amber-500/10' :
                              s.status === 'error' ? 'text-red-400 bg-red-500/10' :
                              'text-slate-500 bg-white/[0.03]'
                            }`}>
                              {s.status === 'online' && <Wifi className="w-2.5 h-2.5" />}
                              {s.status === 'offline' && <WifiOff className="w-2.5 h-2.5" />}
                              {s.status === 'installing' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                              {s.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setEditServerModal({ ...s, ssh_pass: '' })}
                                className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-600 hover:text-blue-400 transition-all" title="Edit Server">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => serverCommand(s.id, 'start')} disabled={serverAction === `${s.id}-start`}
                                className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400 transition-all" title="Start Squid">
                                {serverAction === `${s.id}-start` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => serverCommand(s.id, 'stop', 'Stop Squid on this server?')} disabled={serverAction === `${s.id}-stop`}
                                className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400 transition-all" title="Stop Squid">
                                {serverAction === `${s.id}-stop` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => serverCommand(s.id, 'restart')} disabled={serverAction === `${s.id}-restart`}
                                className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400 transition-all" title="Restart Squid">
                                {serverAction === `${s.id}-restart` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => serverCommand(s.id, 'reboot', 'REBOOT entire server? This will disconnect all active streams.')} disabled={serverAction === `${s.id}-reboot`}
                                className="p-1.5 rounded-lg hover:bg-orange-500/10 text-slate-600 hover:text-orange-400 transition-all" title="Reboot Server">
                                {serverAction === `${s.id}-reboot` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => checkServerHealth(s.id)} disabled={checkingServer === s.id}
                                className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-600 hover:text-blue-400 transition-all" title="Health Check">
                                {checkingServer === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => serverCommand(s.id, 'secure-squid', 'Restrict Squid to master server IP only? This will block all external access to Squid.')}
                                disabled={serverAction === `${s.id}-secure-squid`}
                                className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400 transition-all" title="Secure Squid (restrict to master IP)">
                                {serverAction === `${s.id}-secure-squid` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => deleteServerItem(s.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {servers.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No servers added yet. Click "Add Server" to deploy a proxy node.</div>}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Server Modal */}
      {serverModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => !serverInstalling && setServerModal(false)}>
          <div className="glass rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Add Proxy Server</h3>
            <p className="text-xs text-slate-500 mb-5">Enter VPS credentials. Squid proxy will be installed automatically via SSH.</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Server IP</label>
                  <input className="input-field text-xs" placeholder="1.2.3.4" value={serverForm.ip} onChange={e => setServerForm({...serverForm, ip: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">SSH Port</label>
                  <input className="input-field text-xs" placeholder="22" value={serverForm.ssh_port} onChange={e => setServerForm({...serverForm, ssh_port: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Username</label>
                  <input className="input-field text-xs" placeholder="root" value={serverForm.username} onChange={e => setServerForm({...serverForm, username: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Password</label>
                  <input type="password" className="input-field text-xs" placeholder="server password" value={serverForm.password} onChange={e => setServerForm({...serverForm, password: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Country Code</label>
                  <input className="input-field text-xs" placeholder="US, DE, UK..." value={serverForm.country} onChange={e => setServerForm({...serverForm, country: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Label</label>
                  <input className="input-field text-xs" placeholder="US Server 1" value={serverForm.label} onChange={e => setServerForm({...serverForm, label: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Max Connections</label>
                  <input type="number" className="input-field text-xs" placeholder="100" value={serverForm.max_connections} onChange={e => setServerForm({...serverForm, max_connections: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Bandwidth (info)</label>
                  <input className="input-field text-xs" placeholder="1Gbps, 10Gbps..." value={serverForm.bandwidth_limit} onChange={e => setServerForm({...serverForm, bandwidth_limit: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setServerModal(false)} disabled={serverInstalling} className="btn-secondary flex-1 text-xs" style={{ padding: '0.6rem 1rem' }}>Cancel</button>
              <button onClick={addServer} disabled={serverInstalling || !serverForm.ip || !serverForm.password || !serverForm.country}
                className="btn-primary flex-1 text-xs flex items-center justify-center gap-2" style={{ padding: '0.6rem 1rem' }}>
                {serverInstalling ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Installing...</> : <><Server className="w-3.5 h-3.5" /> Install &amp; Add</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Modal */}
      {creditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setCreditModal(null)}>
          <div className="glass rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Add Credits</h3>
            <p className="text-sm text-slate-500 mb-5">
              User: <span className="text-slate-300">{creditModal.username}</span> (balance: {creditModal.credits})
            </p>
            <input type="number" min="1" max="10000" className="input-field mb-4" placeholder="Amount" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setCreditModal(null)} className="btn-secondary flex-1 text-sm" style={{ padding: '0.6rem 1rem' }}>Cancel</button>
              <button onClick={addCredits} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2" style={{ padding: '0.6rem 1rem' }}>
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setPasswordModal(null)}>
          <div className="glass rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Change Password</h3>
            <p className="text-sm text-slate-500 mb-5">
              User: <span className="text-slate-300">{passwordModal.username}</span>
            </p>
            <input type="password" minLength="6" className="input-field mb-4" placeholder="New password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setPasswordModal(null)} className="btn-secondary flex-1 text-sm" style={{ padding: '0.6rem 1rem' }}>Cancel</button>
              <button onClick={changePassword} disabled={newPassword.length < 6} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2" style={{ padding: '0.6rem 1rem' }}>
                <KeyRound className="w-4 h-4" /> Update
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Create User Modal */}
      {createUserModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setCreateUserModal(false)}>
          <div className="glass rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Create User</h3>
            <p className="text-xs text-slate-500 mb-5">Create a new user account manually</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Username</label>
                  <input className="input-field text-xs" placeholder="username" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                  <input className="input-field text-xs" placeholder="email@example.com" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Password</label>
                  <input type="password" className="input-field text-xs" placeholder="min 6 chars" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Initial Credits</label>
                  <input type="number" className="input-field text-xs" placeholder="0" min="0" value={newUser.credits} onChange={e => setNewUser({...newUser, credits: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setCreateUserModal(false)} className="btn-secondary flex-1 text-xs" style={{ padding: '0.6rem 1rem' }}>Cancel</button>
              <button onClick={createUser} disabled={!newUser.username || !newUser.email || !newUser.password}
                className="btn-primary flex-1 text-xs flex items-center justify-center gap-2" style={{ padding: '0.6rem 1rem' }}>
                <UserPlus className="w-3.5 h-3.5" /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Server Modal */}
      {editServerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setEditServerModal(null)}>
          <div className="glass rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Edit Server</h3>
            <p className="text-xs text-slate-500 mb-5">{editServerModal.ip}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Country Code</label>
                  <input className="input-field text-xs" value={editServerModal.country || ''}
                    onChange={e => setEditServerModal({...editServerModal, country: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Label</label>
                  <input className="input-field text-xs" value={editServerModal.label || ''}
                    onChange={e => setEditServerModal({...editServerModal, label: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">SSH Password (leave empty to keep current)</label>
                <input type="password" className="input-field text-xs" placeholder="Enter new password" value={editServerModal.ssh_pass || ''}
                  onChange={e => setEditServerModal({...editServerModal, ssh_pass: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditServerModal(null)} className="btn-secondary flex-1 text-xs" style={{ padding: '0.6rem 1rem' }}>Cancel</button>
              <button onClick={saveServerEdit} className="btn-primary flex-1 text-xs flex items-center justify-center gap-2" style={{ padding: '0.6rem 1rem' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in-up ${
          toast.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' :
          toast.type === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-400' :
          'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400'
        }`} style={{ backdropFilter: 'blur(20px)' }}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
          {toast.type === 'error' && <WifiOff className="w-5 h-5" />}
          {toast.type === 'info' && <Activity className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
