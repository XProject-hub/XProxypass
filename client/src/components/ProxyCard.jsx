import { useState, useEffect } from 'react';
import { Globe, ArrowRight, Pause, Play, Trash2, ExternalLink, MapPin, Clock, RefreshCw, Radio, Edit3, Check, X } from 'lucide-react';

export default function ProxyCard({ proxy, domain, onToggle, onDelete, onRenew, onRequestStream, onEdit }) {
  const proxyUrl = `${proxy.subdomain}.${proxy.proxy_domain || domain}`;
  const isExpired = proxy.expires_at && new Date(proxy.expires_at) < new Date();
  const [showRenew, setShowRenew] = useState(false);
  const [renewVal, setRenewVal] = useState('1month');
  const [renewing, setRenewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSub, setEditSub] = useState(proxy.subdomain);
  const [editTarget, setEditTarget] = useState(proxy.target_url);
  const [editCountry, setEditCountry] = useState(proxy.country || 'auto');
  const [countries, setCountries] = useState([]);

  const [liveData, setLiveData] = useState({ connections: 0, bandwidth_mbps: '0.00' });

  useEffect(() => {
    if (proxy.stream_proxy !== 2) return;
    const fetchLive = () => {
      fetch(`/api/connections/${proxy.id}`).then(r => r.json()).then(d => setLiveData(d)).catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 3000);
    return () => clearInterval(interval);
  }, [proxy.id, proxy.stream_proxy]);

  const daysLeft = proxy.expires_at
    ? Math.max(0, Math.ceil((new Date(proxy.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  const bwMB = (proxy.bandwidth_used || 0) / 1048576;
  const bwGB = bwMB / 1024;
  const bwDisplay = bwGB >= 1 ? `${bwGB.toFixed(1)} GB` : `${bwMB.toFixed(1)} MB`;

  const handleRenew = async () => {
    setRenewing(true);
    await onRenew(proxy.id, renewVal);
    setRenewing(false);
    setShowRenew(false);
  };

  const handleEdit = async () => {
    if (onEdit) {
      await onEdit(proxy.id, editSub, editTarget, editCountry);
    }
    setEditing(false);
  };

  const openEdit = () => {
    setEditing(!editing);
    if (!editing && countries.length === 0) {
      fetch('/api/proxies/countries').then(r => r.json()).then(d => setCountries(d.countries || [])).catch(() => {});
    }
  };

  return (
    <div className="glass rounded-xl p-5 group glass-hover">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isExpired ? 'bg-red-500/10 border border-red-500/20' : proxy.is_active ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-500/10 border border-slate-500/20'}`}>
            <Globe className={`w-5 h-5 ${isExpired ? 'text-red-400' : proxy.is_active ? 'text-emerald-400' : 'text-slate-500'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-100">{proxy.subdomain}</h3>
              <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${isExpired ? 'text-red-400 bg-red-500/10' : proxy.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-slate-500/10'}`}>
                {isExpired ? 'Expired' : proxy.is_active ? 'Active' : 'Paused'}
              </span>
              {proxy.country && proxy.country !== 'auto' && (
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" /> {proxy.country}
                </span>
              )}
              {proxy.stream_proxy === 2 && (
                <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  <Radio className="w-2.5 h-2.5" /> Stream
                </span>
              )}
              {proxy.stream_proxy === 1 && (
                <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  Stream Pending
                </span>
              )}
            </div>
            <a href={`http://${proxyUrl}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 mt-0.5">
              {proxyUrl} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={openEdit} className="p-2 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-all" title="Edit">
            <Edit3 className="w-4 h-4" />
          </button>
          {proxy.stream_proxy === 0 && onRequestStream && (
            <button onClick={() => onRequestStream(proxy.id)} className="p-2 rounded-lg hover:bg-purple-500/10 text-slate-500 hover:text-purple-400 transition-all" title="Request Stream Proxy">
              <Radio className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setShowRenew(!showRenew)} className="p-2 rounded-lg hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400 transition-all" title="Renew">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => onToggle(proxy.id)} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-all"
            title={proxy.is_active ? 'Pause' : 'Resume'}>
            {proxy.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(proxy.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Edit Panel */}
      {editing && (
        <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-2">
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Subdomain</label>
            <input className="input-field text-xs mt-1" value={editSub}
              onChange={e => setEditSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Target URL</label>
            <input className="input-field text-xs mt-1" value={editTarget}
              onChange={e => setEditTarget(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Country</label>
            <select className="input-field text-xs mt-1 cursor-pointer" value={editCountry}
              onChange={e => setEditCountry(e.target.value)}>
              {countries.map(c => (
                <option key={c.code} value={c.code} style={{ background: '#0d0d14', color: '#f1f5f9' }}>
                  {c.code === 'auto' ? 'Auto (Direct)' : `${c.code} - ${c.name}`}
                </option>
              ))}
              {countries.length === 0 && <option value={editCountry}>{editCountry}</option>}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleEdit} className="btn-primary text-xs flex items-center gap-1" style={{ padding: '0.4rem 0.8rem' }}>
              <Check className="w-3 h-3" /> Save
            </button>
            <button onClick={() => { setEditing(false); setEditSub(proxy.subdomain); setEditTarget(proxy.target_url); setEditCountry(proxy.country || 'auto'); }}
              className="btn-secondary text-xs flex items-center gap-1" style={{ padding: '0.4rem 0.8rem' }}>
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/[0.02] rounded-lg p-3">
        <span className="font-mono truncate">{proxyUrl}</span>
        <ArrowRight className="w-3 h-3 flex-shrink-0 text-cyan-500/50" />
        <span className="font-mono truncate">{proxy.target_url}</span>
      </div>

      {/* Stream Stats */}
      {proxy.stream_proxy === 2 && (
        <div className="mt-3 p-3 rounded-lg bg-white/[0.02] space-y-2">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className={`text-lg font-bold ${parseInt(liveData.connections) > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{liveData.connections}</p>
              <p className="text-[10px] text-slate-600">Connections</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${parseFloat(liveData.bandwidth_mbps) > 0 ? 'text-cyan-400' : 'text-slate-600'}`}>{liveData.bandwidth_mbps}</p>
              <p className="text-[10px] text-slate-600">Mbps Live</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-300">{bwDisplay}</p>
              <p className="text-[10px] text-slate-600">Total Used</p>
            </div>
          </div>
          {proxy.bandwidth_limit > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                <span>Limit: {proxy.bandwidth_limit} Mbps</span>
                <span>{Math.min(100, (parseFloat(liveData.bandwidth_mbps) / proxy.bandwidth_limit * 100)).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${parseFloat(liveData.bandwidth_mbps) / proxy.bandwidth_limit > 0.8 ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}
                  style={{ width: `${Math.min(100, parseFloat(liveData.bandwidth_mbps) / proxy.bandwidth_limit * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span>{proxy.requests_count.toLocaleString()} requests</span>
          {proxy.bandwidth_used > 0 && !proxy.bandwidth_used && (
            <span>{bwDisplay}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {daysLeft !== null && (
            <span className={`flex items-center gap-1 ${isExpired ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : ''}`}>
              <Clock className="w-3 h-3" />
              {isExpired ? 'Expired' : `${daysLeft}d left`}
            </span>
          )}
          <span>{new Date(proxy.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Renew Panel */}
      {showRenew && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-2">
            <select value={renewVal} onChange={e => setRenewVal(e.target.value)}
              className="input-field text-xs flex-1" style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)' }}>
              <option value="1month" style={{ background: '#0d0d14' }}>+1 Month (1 credit)</option>
              <option value="3months" style={{ background: '#0d0d14' }}>+3 Months (2 credits)</option>
              <option value="6months" style={{ background: '#0d0d14' }}>+6 Months (4 credits)</option>
              <option value="12months" style={{ background: '#0d0d14' }}>+12 Months (6 credits)</option>
            </select>
            <button onClick={handleRenew} disabled={renewing}
              className="btn-primary text-xs flex items-center gap-1.5" style={{ padding: '0.5rem 1rem' }}>
              {renewing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><RefreshCw className="w-3 h-3" /> Renew</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
