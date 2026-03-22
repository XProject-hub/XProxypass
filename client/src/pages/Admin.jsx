import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  Users, Globe, Activity, Trash2, Shield, ShieldOff, UserPlus,
  Plus, Loader2, ArrowLeft, CreditCard, ScrollText,
  LayoutList, Clock, MapPin, Server, RefreshCw, Wifi, WifiOff, CheckCircle2
} from 'lucide-react';

import { Radio } from 'lucide-react';

const TABS = [
  { id: 'proxies', label: 'Proxies', icon: Globe },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'streams', label: 'Stream Requests', icon: Radio },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'credits', label: 'Credit History', icon: CreditCard },
  { id: 'activity', label: 'Activity Log', icon: ScrollText },
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
  const [regOpen, setRegOpen] = useState(true);
  const [createUserModal, setCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', credits: '0' });
  const [loading, setLoading] = useState(true);
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [serverModal, setServerModal] = useState(false);
  const [serverForm, setServerForm] = useState({ ip: '', ssh_port: '22', username: 'root', password: '', country: 'US', label: '' });
  const [serverInstalling, setServerInstalling] = useState(false);

  useEffect(() => { loadData(); }, []);

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
      const setRes = await fetch('/api/admin/settings');
      if (setRes.ok) { const d = await setRes.json(); setRegOpen(d.registration_open); }
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
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_admin: data.user.is_admin } : u));
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
        setServerForm({ ip: '', ssh_port: '22', username: 'root', password: '', country: 'US', label: '' });
        loadData();
        setTimeout(loadData, 30000);
        setTimeout(loadData, 60000);
        setTimeout(loadData, 120000);
      }
    } catch (err) { console.error(err); }
    finally { setServerInstalling(false); }
  };

  const checkServerHealth = async (id) => {
    const res = await fetch(`/api/admin/servers/${id}/check`, { method: 'POST' });
    if (res.ok) loadData();
  };

  const approveStream = async (id) => {
    const res = await fetch(`/api/admin/proxies/${id}/approve-stream`, { method: 'POST' });
    if (res.ok) loadData();
  };

  const denyStream = async (id) => {
    const res = await fetch(`/api/admin/proxies/${id}/deny-stream`, { method: 'POST' });
    if (res.ok) loadData();
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

          {/* Proxies Tab */}
          {tab === 'proxies' && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-6">All Proxies</h2>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['ID', 'Subdomain', 'Target URL', 'Country', 'Owner', 'Requests', 'Status', 'Expires', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {proxies.map(p => (
                        <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.id}</td>
                          <td className="px-4 py-3 text-cyan-400 font-mono text-xs">{p.subdomain}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[180px] truncate">{p.target_url}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <MapPin className="w-3 h-3 text-slate-600" /> {p.country || 'auto'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{p.owner_username || '-'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{p.requests_count.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${p.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/[0.03]'}`}>
                              {p.is_active ? 'Active' : 'Paused'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : 'Never'}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => deleteProxy(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
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
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${u.is_admin ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 bg-white/[0.03]'}`}>
                              {u.is_admin ? 'Admin' : 'User'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setCreditModal(u); setCreditAmount(''); }} className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400 transition-all" title="Add Credits">
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => toggleAdmin(u.id, u.is_admin)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400 transition-all" title={u.is_admin ? 'Remove Admin' : 'Make Admin'}>
                                {u.is_admin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
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
                        {['Subdomain', 'Target', 'Owner', 'Bandwidth', 'Status', 'Actions'].map(h => (
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
                          <td className="px-4 py-3 text-slate-400 text-xs">{((sr.bandwidth_used || 0) / 1048576).toFixed(1)} MB</td>
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
                  Add your own VPS servers as proxy nodes. Enter the server IP, SSH credentials, and country - the system will automatically connect via SSH and install Squid proxy.
                  Own servers have priority over free proxies for country routing.
                </p>
              </div>

              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['ID', 'IP', 'Port', 'Country', 'Label', 'Status', 'Last Check', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map(s => (
                        <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.id}</td>
                          <td className="px-4 py-3 text-cyan-400 font-mono text-xs">{s.ip}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{s.port}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{s.country}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{s.label || '-'}</td>
                          <td className="px-4 py-3">
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
                          <td className="px-4 py-3 text-slate-500 text-xs">{s.last_check ? new Date(s.last_check).toLocaleString() : 'Never'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => checkServerHealth(s.id)} className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400 transition-all" title="Health Check">
                                <RefreshCw className="w-3.5 h-3.5" />
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
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Label (optional)</label>
                  <input className="input-field text-xs" placeholder="US Server 1" value={serverForm.label} onChange={e => setServerForm({...serverForm, label: e.target.value})} />
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
    </div>
  );
}
