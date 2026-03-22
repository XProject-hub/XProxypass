import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  Users, Globe, Activity, Trash2, Shield, ShieldOff,
  Plus, Loader2, ArrowLeft, CreditCard, ScrollText,
  LayoutList, Clock, MapPin
} from 'lucide-react';

const TABS = [
  { id: 'proxies', label: 'Proxies', icon: Globe },
  { id: 'users', label: 'Users', icon: Users },
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
  const [loading, setLoading] = useState(true);
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [uRes, pRes, sRes, chRes, alRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/proxies'),
        fetch('/api/admin/stats'),
        fetch('/api/admin/credit-history'),
        fetch('/api/admin/activity-log'),
      ]);
      if (uRes.ok) setUsers((await uRes.json()).users);
      if (pRes.ok) setProxies((await pRes.json()).proxies);
      if (sRes.ok) setStats((await sRes.json()).stats);
      if (chRes.ok) setCreditHistory((await chRes.json()).history);
      if (alRes.ok) setActivityLogs((await alRes.json()).logs);
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

          {/* Stats in sidebar */}
          <div className="mt-8 space-y-3 px-1">
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
              <h2 className="text-xl font-bold text-slate-100 mb-6">All Users</h2>
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
        </main>
      </div>

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
    </div>
  );
}
