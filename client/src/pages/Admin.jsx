import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  Users, Globe, Activity, Trash2, Shield, ShieldOff,
  Plus, Loader2, ArrowLeft, CreditCard
} from 'lucide-react';

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [uRes, pRes, sRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/proxies'),
        fetch('/api/admin/stats'),
      ]);
      if (uRes.ok) setUsers((await uRes.json()).users);
      if (pRes.ok) setProxies((await pRes.json()).proxies);
      if (sRes.ok) setStats((await sRes.json()).stats);
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user and all their proxies?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id));
  };

  const toggleAdmin = async (id, currentAdmin) => {
    const res = await fetch(`/api/admin/users/${id}/admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseInt(creditAmount) }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(u => u.id === creditModal.id ? { ...u, credits: data.user.credits } : u));
      setCreditModal(null);
      setCreditAmount('');
    }
  };

  const deleteProxy = async (id) => {
    if (!confirm('Delete this proxy?')) return;
    const res = await fetch(`/api/admin/proxies/${id}`, { method: 'DELETE' });
    if (res.ok) setProxies(prev => prev.filter(p => p.id !== id));
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-100">
            <span className="gradient-text">Admin</span> Panel
          </h1>
        </div>
        <p className="text-sm text-slate-500 mb-8 ml-8">Manage users, proxies, and credits</p>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{stats?.total_users || 0}</p>
                <p className="text-xs text-slate-500">Total Users</p>
              </div>
            </div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{stats?.total_proxies || 0}</p>
                <p className="text-xs text-slate-500">Total Proxies</p>
              </div>
            </div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{(stats?.total_requests || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">Total Requests</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('users')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'users' ? 'bg-white/[0.08] text-cyan-400 border border-white/[0.1]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}`}>
            <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Users ({users.length})</span>
          </button>
          <button onClick={() => setTab('proxies')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'proxies' ? 'bg-white/[0.08] text-cyan-400 border border-white/[0.1]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}`}>
            <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> Proxies ({proxies.length})</span>
          </button>
        </div>

        {/* Users Table */}
        {tab === 'users' && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Credits</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Joined</th>
                    <th className="text-right px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{u.id}</td>
                      <td className="px-5 py-3.5 text-slate-200 font-medium">{u.username}</td>
                      <td className="px-5 py-3.5 text-slate-400">{u.email}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-cyan-400 font-semibold">{u.credits}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${u.is_admin ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 bg-white/[0.03]'}`}>
                          {u.is_admin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setCreditModal(u); setCreditAmount(''); }} className="p-2 rounded-lg hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400 transition-all" title="Add Credits">
                            <CreditCard className="w-4 h-4" />
                          </button>
                          <button onClick={() => toggleAdmin(u.id, u.is_admin)} className="p-2 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-all" title={u.is_admin ? 'Remove Admin' : 'Make Admin'}>
                            {u.is_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                          </button>
                          <button onClick={() => deleteUser(u.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all" title="Delete User">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">No users registered yet</div>
            )}
          </div>
        )}

        {/* Proxies Table */}
        {tab === 'proxies' && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Subdomain</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Target</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Owner</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Requests</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Expires</th>
                    <th className="text-right px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proxies.map(p => (
                    <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{p.id}</td>
                      <td className="px-5 py-3.5 text-cyan-400 font-mono text-xs">{p.subdomain}</td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-xs max-w-[200px] truncate">{p.target_url}</td>
                      <td className="px-5 py-3.5 text-slate-300">{p.owner_username || 'N/A'}</td>
                      <td className="px-5 py-3.5 text-slate-400">{p.requests_count.toLocaleString()}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${p.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/[0.03]'}`}>
                          {p.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">
                        {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => deleteProxy(p.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all" title="Delete Proxy">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {proxies.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">No proxies created yet</div>
            )}
          </div>
        )}
      </div>

      {/* Credit Modal */}
      {creditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setCreditModal(null)}>
          <div className="glass rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Add Credits</h3>
            <p className="text-sm text-slate-500 mb-5">
              User: <span className="text-slate-300">{creditModal.username}</span> (current: {creditModal.credits})
            </p>
            <input
              type="number"
              min="1"
              max="10000"
              className="input-field mb-4"
              placeholder="Amount of credits"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setCreditModal(null)} className="btn-secondary flex-1 text-sm" style={{ padding: '0.6rem 1rem' }}>
                Cancel
              </button>
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
