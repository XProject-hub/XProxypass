import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import {
  Users, Globe, Radio, BarChart3, Plus, Trash2, CreditCard,
  ArrowLeft, Check, X, Loader2, ChevronDown, Save, Eye, EyeOff,
} from 'lucide-react';

const TABS = [
  { id: 'users', label: 'Sub-Users', icon: Users },
  { id: 'proxies', label: 'Proxies', icon: Globe },
  { id: 'streams', label: 'Streams', icon: Radio },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
];

export default function Reseller() {
  const { user } = useAuth();
  const [tab, setTab] = useState('users');
  const [subUsers, setSubUsers] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [streamRequests, setStreamRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', credits: 0 });
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState(1);
  const [bwLimits, setBwLimits] = useState({});

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      const [usersRes, proxiesRes, streamsRes, statsRes] = await Promise.all([
        fetch('/api/reseller/users'),
        fetch('/api/reseller/proxies'),
        fetch('/api/reseller/stream-requests'),
        fetch('/api/reseller/stats'),
      ]);
      if (usersRes.ok) setSubUsers((await usersRes.json()).users);
      if (proxiesRes.ok) setProxies((await proxiesRes.json()).proxies);
      if (streamsRes.ok) setStreamRequests((await streamsRes.json()).requests);
      if (statsRes.ok) setStats((await statsRes.json()).stats);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      return showToast('All fields required', 'error');
    }
    try {
      const res = await fetch('/api/reseller/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (res.ok) {
        setSubUsers(prev => [data.user, ...prev]);
        setShowCreateUser(false);
        setNewUser({ username: '', email: '', password: '', credits: 0 });
        showToast('User created');
        loadData();
      } else {
        showToast(data.error, 'error');
      }
    } catch { showToast('Failed to create user', 'error'); }
  };

  const handleTransferCredits = async () => {
    if (!creditModal || creditAmount < 1) return;
    try {
      const res = await fetch(`/api/reseller/users/${creditModal.id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: creditAmount }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubUsers(prev => prev.map(u => u.id === creditModal.id ? data.user : u));
        setCreditModal(null);
        setCreditAmount(1);
        showToast('Credits transferred');
        loadData();
      } else {
        showToast(data.error, 'error');
      }
    } catch { showToast('Transfer failed', 'error'); }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Delete this sub-user? All their proxies will also be deleted.')) return;
    try {
      const res = await fetch(`/api/reseller/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSubUsers(prev => prev.filter(u => u.id !== id));
        showToast('User deleted');
        loadData();
      }
    } catch { showToast('Delete failed', 'error'); }
  };

  const handleApproveStream = async (id) => {
    try {
      const res = await fetch(`/api/reseller/proxies/${id}/approve-stream`, { method: 'POST' });
      if (res.ok) {
        showToast('Stream approved');
        loadData();
      }
    } catch { showToast('Failed', 'error'); }
  };

  const handleDenyStream = async (id) => {
    try {
      const res = await fetch(`/api/reseller/proxies/${id}/deny-stream`, { method: 'POST' });
      if (res.ok) {
        showToast('Stream denied');
        loadData();
      }
    } catch { showToast('Failed', 'error'); }
  };

  const handleSaveBwLimit = async (id) => {
    try {
      const res = await fetch(`/api/reseller/proxies/${id}/bandwidth-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit_mbps: bwLimits[id] || 0 }),
      });
      if (res.ok) { showToast('Bandwidth limit saved'); loadData(); }
    } catch { showToast('Failed', 'error'); }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
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
      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
          toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>{toast.msg}</div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-slate-500 hover:text-slate-300 transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Reseller Panel</h1>
              <p className="text-sm text-slate-500 mt-1">Manage your sub-users and their proxies</p>
            </div>
          </div>
          {stats && (
            <div className="text-sm text-slate-400">
              Credits: <span className="text-cyan-400 font-semibold">{stats.credits}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                tab === t.id ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Sub-Users Tab */}
        {tab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-200">Sub-Users ({subUsers.length}{stats?.max_users ? `/${stats.max_users}` : ''})</h2>
              <button onClick={() => setShowCreateUser(true)} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Create User
              </button>
            </div>

            {showCreateUser && (
              <div className="glass rounded-xl p-6 mb-6 border border-cyan-500/10">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Create Sub-User</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})}
                    placeholder="Username" className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                  <input value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})}
                    placeholder="Email" type="email" className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                  <input value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})}
                    placeholder="Password" type="password" className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                  <input value={newUser.credits} onChange={e => setNewUser({...newUser, credits: parseInt(e.target.value) || 0})}
                    placeholder="Initial credits" type="number" min="0" className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={handleCreateUser} className="btn-primary text-sm">Create</button>
                  <button onClick={() => setShowCreateUser(false)} className="btn-secondary text-sm">Cancel</button>
                </div>
              </div>
            )}

            <div className="glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]">
                    <th className="text-left text-slate-500 font-medium p-4">Username</th>
                    <th className="text-left text-slate-500 font-medium p-4">Email</th>
                    <th className="text-left text-slate-500 font-medium p-4">Credits</th>
                    <th className="text-left text-slate-500 font-medium p-4">Created</th>
                    <th className="text-right text-slate-500 font-medium p-4">Actions</th>
                  </tr></thead>
                  <tbody>
                    {subUsers.map(u => (
                      <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="p-4 text-slate-200 font-medium">{u.username}</td>
                        <td className="p-4 text-slate-400">{u.email}</td>
                        <td className="p-4"><span className="text-amber-400 font-semibold">{u.credits}</span></td>
                        <td className="p-4 text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setCreditModal(u); setCreditAmount(1); }}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition">
                              <CreditCard className="w-3.5 h-3.5 inline mr-1" /> Credits
                            </button>
                            <button onClick={() => handleDeleteUser(u.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {subUsers.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">No sub-users yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Proxies Tab */}
        {tab === 'proxies' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Sub-User Proxies ({proxies.length}{stats?.max_proxies ? `/${stats.max_proxies}` : ''})</h2>
            <div className="glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]">
                    <th className="text-left text-slate-500 font-medium p-4">Subdomain</th>
                    <th className="text-left text-slate-500 font-medium p-4">Target</th>
                    <th className="text-left text-slate-500 font-medium p-4">Owner</th>
                    <th className="text-left text-slate-500 font-medium p-4">Stream</th>
                    <th className="text-left text-slate-500 font-medium p-4">Bandwidth</th>
                    <th className="text-left text-slate-500 font-medium p-4">Requests</th>
                  </tr></thead>
                  <tbody>
                    {proxies.map(p => (
                      <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="p-4 text-cyan-400 font-medium">{p.subdomain}.{p.proxy_domain}</td>
                        <td className="p-4 text-slate-400 max-w-[200px] truncate">{p.target_url}</td>
                        <td className="p-4 text-slate-300">{p.owner_username}</td>
                        <td className="p-4">
                          {p.stream_proxy === 2 && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>}
                          {p.stream_proxy === 1 && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>}
                          {p.stream_proxy === 0 && <span className="text-slate-600 text-xs">DNS</span>}
                        </td>
                        <td className="p-4 text-slate-400">{formatBytes(p.bandwidth_used)}</td>
                        <td className="p-4 text-slate-400">{(p.requests_count || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    {proxies.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">No proxies</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Streams Tab */}
        {tab === 'streams' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Stream Requests</h2>
            <div className="glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]">
                    <th className="text-left text-slate-500 font-medium p-4">Subdomain</th>
                    <th className="text-left text-slate-500 font-medium p-4">Owner</th>
                    <th className="text-left text-slate-500 font-medium p-4">Status</th>
                    <th className="text-left text-slate-500 font-medium p-4">Bandwidth Used</th>
                    <th className="text-left text-slate-500 font-medium p-4">Limit (Mbps)</th>
                    <th className="text-right text-slate-500 font-medium p-4">Actions</th>
                  </tr></thead>
                  <tbody>
                    {streamRequests.map(s => (
                      <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="p-4 text-cyan-400 font-medium">{s.subdomain}</td>
                        <td className="p-4 text-slate-300">{s.owner_username}</td>
                        <td className="p-4">
                          {s.stream_proxy === 2 && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Approved</span>}
                          {s.stream_proxy === 1 && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>}
                        </td>
                        <td className="p-4 text-slate-400">{formatBytes(s.bandwidth_used)}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <input type="number" min="0" value={bwLimits[s.id] ?? s.bandwidth_limit ?? 0}
                              onChange={e => setBwLimits({...bwLimits, [s.id]: parseInt(e.target.value) || 0})}
                              className="w-20 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-sm text-slate-200" />
                            <button onClick={() => handleSaveBwLimit(s.id)} className="text-cyan-400 hover:text-cyan-300">
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {s.stream_proxy === 1 && (
                              <>
                                <button onClick={() => handleApproveStream(s.id)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition">
                                  <Check className="w-3.5 h-3.5 inline mr-1" /> Approve
                                </button>
                                <button onClick={() => handleDenyStream(s.id)}
                                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition">
                                  <X className="w-3.5 h-3.5 inline mr-1" /> Deny
                                </button>
                              </>
                            )}
                            {s.stream_proxy === 2 && (
                              <button onClick={() => handleDenyStream(s.id)}
                                className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition">
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {streamRequests.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">No stream requests</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Reseller Statistics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass rounded-xl p-5">
                <p className="text-2xl font-bold text-slate-100">{stats.total_users}<span className="text-sm text-slate-500 font-normal">{stats.max_users ? ` / ${stats.max_users}` : ''}</span></p>
                <p className="text-xs text-slate-500 mt-1">Sub-Users</p>
              </div>
              <div className="glass rounded-xl p-5">
                <p className="text-2xl font-bold text-slate-100">{stats.total_proxies}<span className="text-sm text-slate-500 font-normal">{stats.max_proxies ? ` / ${stats.max_proxies}` : ''}</span></p>
                <p className="text-xs text-slate-500 mt-1">Proxies</p>
              </div>
              <div className="glass rounded-xl p-5">
                <p className="text-2xl font-bold text-slate-100">{(stats.total_requests || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Total Requests</p>
              </div>
              <div className="glass rounded-xl p-5">
                <p className="text-2xl font-bold text-slate-100">{formatBytes(stats.total_bandwidth)}</p>
                <p className="text-xs text-slate-500 mt-1">Total Bandwidth</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Credit Transfer Modal */}
      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCreditModal(null)}>
          <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4 border border-white/[0.06]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Transfer Credits to {creditModal.username}</h3>
            <p className="text-sm text-slate-400 mb-4">Your balance: <span className="text-cyan-400 font-semibold">{stats?.credits || 0}</span></p>
            <input type="number" min="1" value={creditAmount} onChange={e => setCreditAmount(parseInt(e.target.value) || 0)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-200 mb-4" />
            <div className="flex gap-2">
              <button onClick={handleTransferCredits} className="btn-primary text-sm flex-1">Transfer</button>
              <button onClick={() => setCreditModal(null)} className="btn-secondary text-sm flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
