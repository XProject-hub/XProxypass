import { useState, useEffect } from 'react';
import { Globe, ArrowRight, Pause, Play, Trash2, ExternalLink, MapPin, Clock, RefreshCw, Radio, Edit3, Check, X, Lock, Unlock, Key, Copy, Loader2, Plus, Shield } from 'lucide-react';

export default function ProxyCard({ proxy, domain, onToggle, onDelete, onRenew, onRequestStream, onEdit, onUpdate }) {
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
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [tokenHours, setTokenHours] = useState(24);
  const [tokenUser, setTokenUser] = useState('');
  const [tokenPass, setTokenPass] = useState('');
  const [generatingToken, setGeneratingToken] = useState(false);
  const [ipLocking, setIpLocking] = useState(false);
  const [showIpPanel, setShowIpPanel] = useState(false);
  const [newIp, setNewIp] = useState('');

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

  const ipList = (() => {
    if (!proxy.ip_lock) return [];
    try { const arr = JSON.parse(proxy.ip_lock); return Array.isArray(arr) ? arr : [proxy.ip_lock]; }
    catch { return proxy.ip_lock ? [proxy.ip_lock] : []; }
  })();

  const addIp = async () => {
    const ip = newIp.trim();
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return;
    setIpLocking(true);
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/ip-lock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok && onUpdate) { const d = await res.json(); onUpdate(d.proxy); setNewIp(''); }
      else { const d = await res.json(); alert(d.error || 'Failed'); }
    } catch {} finally { setIpLocking(false); }
  };

  const removeIp = async (ip) => {
    setIpLocking(true);
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/ip-lock`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok && onUpdate) { const d = await res.json(); onUpdate(d.proxy); }
    } catch {} finally { setIpLocking(false); }
  };

  const clearAllIps = async () => {
    if (!confirm('Remove all whitelisted IPs? Stream will be accessible from any IP.')) return;
    setIpLocking(true);
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/ip-lock`, { method: 'DELETE' });
      if (res.ok && onUpdate) { const d = await res.json(); onUpdate(d.proxy); }
    } catch {} finally { setIpLocking(false); }
  };

  const loadTokens = async () => {
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/tokens`);
      if (res.ok) setTokens((await res.json()).tokens || []);
    } catch {}
  };

  const generateToken = async () => {
    if (!tokenUser || !tokenPass) {
      alert('Enter IPTV username and password to generate a tokenized URL.');
      return;
    }
    setGeneratingToken(true);
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/generate-token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_hours: tokenHours, username: tokenUser, password: tokenPass }),
      });
      if (res.ok) {
        const data = await res.json();
        loadTokens();
        try { navigator.clipboard.writeText(data.url); } catch {}
        alert(`Tokenized URL copied!\n\n${data.url}\n\nExpires in ${tokenHours} hours.\nCredentials are encrypted - end user cannot see username/password.`);
        setTokenUser('');
        setTokenPass('');
      }
    } catch {} finally { setGeneratingToken(false); }
  };

  const revokeToken = async (tokenId) => {
    try {
      await fetch(`/api/proxies/${proxy.id}/tokens/${tokenId}`, { method: 'DELETE' });
      loadTokens();
    } catch {}
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
              {ipList.length > 0 && (
                <span className="text-[10px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  <Shield className="w-2.5 h-2.5" /> {ipList.length} IP{ipList.length > 1 ? 's' : ''}
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
          <button onClick={() => setShowIpPanel(!showIpPanel)}
            className={`p-2 rounded-lg transition-all ${ipList.length > 0 ? 'hover:bg-emerald-500/10 text-rose-400 hover:text-emerald-400' : 'hover:bg-rose-500/10 text-slate-500 hover:text-rose-400'}`}
            title={ipList.length > 0 ? `IP Whitelist (${ipList.length})` : 'IP Whitelist'}>
            <Shield className="w-4 h-4" />
          </button>
          {proxy.stream_proxy === 2 && (
            <button onClick={() => { setShowTokens(!showTokens); if (!showTokens) loadTokens(); }}
              className="p-2 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-all" title="Stream Tokens">
              <Key className="w-4 h-4" />
            </button>
          )}
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

      {/* IP Whitelist Panel */}
      {showIpPanel && (
        <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-300">IP Whitelist</span>
            {ipList.length > 0 && (
              <button onClick={clearAllIps} disabled={ipLocking} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">
                Clear All
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-600 mb-3">
            {ipList.length === 0 ? 'No IPs added. Stream accessible from any IP.' : 'Only whitelisted IPs can access this proxy.'}
          </p>
          {ipList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ipList.map(ip => (
                <span key={ip} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 text-[11px] font-mono">
                  {ip}
                  <button onClick={() => removeIp(ip)} disabled={ipLocking}
                    className="hover:text-rose-300 transition-colors ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input value={newIp} onChange={e => setNewIp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addIp()}
              placeholder="Enter IP address (e.g. 1.2.3.4)"
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 flex-1" />
            <button onClick={addIp} disabled={ipLocking || !newIp.trim()}
              className="btn-primary text-[10px] flex items-center gap-1" style={{ padding: '0.4rem 0.7rem' }}>
              {ipLocking ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3" /> Add</>}
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
          {(proxy.speed_limit_mbps > 0 || proxy.bandwidth_limit > 0) && (() => {
            const limit = proxy.speed_limit_mbps || proxy.bandwidth_limit;
            const pct = Math.min(100, parseFloat(liveData.bandwidth_mbps) / limit * 100);
            const label = proxy.speed_limit_mbps > 0 ? `${(proxy.speed_limit_mbps / 1000).toFixed(0)} Gbps plan` : `${proxy.bandwidth_limit} Mbps`;
            return (
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                  <span>{label}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}
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

      {/* Token Management Panel */}
      {showTokens && proxy.stream_proxy === 2 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="mb-3">
            <span className="text-xs font-medium text-slate-300 mb-2 block">Generate Tokenized Stream URL</span>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={tokenUser} onChange={e => setTokenUser(e.target.value)} placeholder="IPTV Username"
                className="bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-slate-200 placeholder-slate-600" />
              <input value={tokenPass} onChange={e => setTokenPass(e.target.value)} placeholder="IPTV Password" type="password"
                className="bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-slate-200 placeholder-slate-600" />
            </div>
            <div className="flex items-center gap-2">
              <select value={tokenHours} onChange={e => setTokenHours(parseInt(e.target.value))}
                className="bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[10px] text-slate-300 flex-1" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <option value="1" style={{ background: '#0d0d14' }}>1 hour</option>
                <option value="6" style={{ background: '#0d0d14' }}>6 hours</option>
                <option value="24" style={{ background: '#0d0d14' }}>24 hours</option>
                <option value="72" style={{ background: '#0d0d14' }}>3 days</option>
                <option value="168" style={{ background: '#0d0d14' }}>7 days</option>
                <option value="720" style={{ background: '#0d0d14' }}>30 days</option>
              </select>
              <button onClick={generateToken} disabled={generatingToken}
                className="btn-primary text-[10px] flex items-center gap-1" style={{ padding: '0.35rem 0.7rem' }}>
                {generatingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Key className="w-3 h-3" /> Generate</>}
              </button>
            </div>
            <p className="text-[9px] text-slate-600 mt-1.5">Credentials are encrypted. End-user gets one URL - no username/password visible.</p>
          </div>
          {tokens.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {tokens.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded bg-white/[0.02] text-[10px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-mono truncate ${t.is_expired ? 'text-red-400 line-through' : 'text-slate-400'}`}>
                      {t.token.slice(0, 16)}...
                    </span>
                    <span className={t.is_expired ? 'text-red-400' : 'text-slate-500'}>
                      {t.is_expired ? 'Expired' : `Expires ${new Date(t.expires_at * 1000).toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!t.is_expired && (
                      <button onClick={() => {
                        const url = `http://${proxy.subdomain}.${proxy.proxy_domain || domain}/stream/${t.token}`;
                        navigator.clipboard.writeText(url).then(() => alert('Token URL copied!')).catch(() => {});
                      }} className="p-1 rounded hover:bg-cyan-500/10 text-slate-600 hover:text-cyan-400" title="Copy URL">
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={() => revokeToken(t.id)}
                      className="p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400" title="Revoke">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tokens.length === 0 && <p className="text-[10px] text-slate-600 text-center py-2">No tokens generated</p>}
        </div>
      )}
    </div>
  );
}
