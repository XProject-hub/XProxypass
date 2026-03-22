import { useState } from 'react';
import { Globe, ArrowRight, Pause, Play, Trash2, ExternalLink, MapPin, Clock, RefreshCw, Radio } from 'lucide-react';

export default function ProxyCard({ proxy, domain, onToggle, onDelete, onRenew, onRequestStream }) {
  const proxyUrl = `${proxy.subdomain}.${domain}`;
  const isExpired = proxy.expires_at && new Date(proxy.expires_at) < new Date();
  const [showRenew, setShowRenew] = useState(false);
  const [renewVal, setRenewVal] = useState('1month');
  const [renewing, setRenewing] = useState(false);

  const daysLeft = proxy.expires_at
    ? Math.max(0, Math.ceil((new Date(proxy.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  const handleRenew = async () => {
    setRenewing(true);
    await onRenew(proxy.id, renewVal);
    setRenewing(false);
    setShowRenew(false);
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

      <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/[0.02] rounded-lg p-3">
        <span className="font-mono truncate">{proxyUrl}</span>
        <ArrowRight className="w-3 h-3 flex-shrink-0 text-cyan-500/50" />
        <span className="font-mono truncate">{proxy.target_url}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span>{proxy.requests_count.toLocaleString()} requests</span>
          {proxy.bandwidth_used > 0 && (
            <span>{(proxy.bandwidth_used / 1048576).toFixed(1)} MB</span>
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
