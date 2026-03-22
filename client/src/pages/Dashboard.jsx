import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import ProxyCard from '../components/ProxyCard';
import { Plus, Server, Activity, Globe, Loader2, CreditCard, ShieldCheck } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [proxies, setProxies] = useState([]);
  const [stats, setStats] = useState(null);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [proxiesRes, statsRes, meRes] = await Promise.all([
        fetch('/api/proxies'),
        fetch('/api/stats'),
        fetch('/api/auth/me'),
      ]);

      if (proxiesRes.ok) {
        const data = await proxiesRes.json();
        setProxies(data.proxies);
        setDomain(window.location.hostname);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (meRes.ok) {
        const data = await meRes.json();
        setCredits(data.user.credits || 0);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await fetch(`/api/proxies/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        setProxies((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_active: p.is_active ? 0 : 1 } : p))
        );
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const handleRenew = async (id, validity) => {
    try {
      const res = await fetch(`/api/proxies/${id}/renew`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validity }),
      });
      if (res.ok) {
        const data = await res.json();
        setProxies(prev => prev.map(p => p.id === id ? data.proxy : p));
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Renew failed');
      }
    } catch (err) {
      console.error('Renew failed:', err);
    }
  };

  const handleRequestStream = async (id) => {
    if (!confirm('Request Stream Proxy mode? This requires admin approval and is for high-bandwidth use cases like IPTV streaming.')) return;
    try {
      const res = await fetch(`/api/proxies/${id}/request-stream`, { method: 'POST' });
      if (res.ok) {
        setProxies(prev => prev.map(p => p.id === id ? { ...p, stream_proxy: 1 } : p));
      } else {
        const data = await res.json();
        alert(data.error || 'Request failed');
      }
    } catch (err) {
      console.error('Stream request failed:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this proxy?')) return;
    try {
      const res = await fetch(`/api/proxies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProxies((prev) => prev.filter((p) => p.id !== id));
        if (stats) setStats({ ...stats, total_proxies: stats.total_proxies - 1 });
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Welcome back, <span className="gradient-text">{user?.username}</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Manage your proxy services</p>
          </div>
          <div className="flex items-center gap-3">
            {user?.is_admin === 1 && (
              <Link to="/admin" className="btn-secondary flex items-center gap-2 text-sm" style={{ padding: '0.6rem 1rem' }}>
                <ShieldCheck className="w-4 h-4" /> Admin Panel
              </Link>
            )}
            <Link to="/dashboard/buy" className="btn-secondary flex items-center gap-2 text-sm" style={{ padding: '0.6rem 1rem' }}>
              <CreditCard className="w-4 h-4" /> Buy Credits
            </Link>
            <Link to="/dashboard/add" className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Add Proxy
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{credits}</p>
                <p className="text-xs text-slate-500">Credits</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{stats?.total_proxies || 0}</p>
                <p className="text-xs text-slate-500">Total Proxies</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{(stats?.total_requests || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">Total Requests</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100">{stats?.active_proxies || 0}</p>
                <p className="text-xs text-slate-500">Active Proxies</p>
              </div>
            </div>
          </div>
        </div>

        {/* Proxy List */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-200">Your Proxies</h2>
          <span className="text-sm text-slate-600">{proxies.length} total</span>
        </div>

        {proxies.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
              <Globe className="w-7 h-7 text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No proxies yet</h3>
            <p className="text-sm text-slate-500 mb-6">Create your first proxy service to get started</p>
            <Link to="/dashboard/add" className="btn-primary inline-flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Create First Proxy
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {proxies.map((proxy) => (
              <ProxyCard
                key={proxy.id}
                proxy={proxy}
                domain={domain}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onRenew={handleRenew}
                onRequestStream={handleRequestStream}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
