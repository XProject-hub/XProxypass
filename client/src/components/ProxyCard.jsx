import { Globe, ArrowRight, Pause, Play, Trash2, ExternalLink, MapPin, Clock } from 'lucide-react';

export default function ProxyCard({ proxy, domain, onToggle, onDelete }) {
  const proxyUrl = `${proxy.subdomain}.${domain}`;
  const isExpired = proxy.expires_at && new Date(proxy.expires_at) < new Date();

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
            </div>
            <a href={`http://${proxyUrl}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 mt-0.5">
              {proxyUrl} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
        <span>{proxy.requests_count.toLocaleString()} requests</span>
        <div className="flex items-center gap-3">
          {proxy.expires_at && (
            <span className={`flex items-center gap-1 ${isExpired ? 'text-red-400' : ''}`}>
              <Clock className="w-3 h-3" /> {isExpired ? 'Expired' : new Date(proxy.expires_at).toLocaleDateString()}
            </span>
          )}
          <span>{new Date(proxy.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
