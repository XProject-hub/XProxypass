import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { Globe, ArrowRight, ArrowLeft, Server, CheckCircle2, Calendar, CreditCard, MapPin } from 'lucide-react';

export default function AddProxy() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ subdomain: '', target_url: '', country: 'auto', expires_at: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [credits, setCredits] = useState(0);
  const [countries, setCountries] = useState([]);

  const domain = window.location.hostname;

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCredits(d.user?.credits || 0)).catch(() => {});
    fetch('/api/proxies/countries').then(r => r.json()).then(d => setCountries(d.countries || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { subdomain: form.subdomain, target_url: form.target_url, country: form.country };
      if (form.expires_at) body.expires_at = form.expires_at;

      const res = await fetch('/api/proxies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create proxy'); return; }
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch { setError('Connection error. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-slate-100 mb-2">Deploy New Proxy</h1>
        <p className="text-sm text-slate-500 mb-8">Create a new reverse proxy service for your website</p>

        <div className="glass rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">Available Credits</p>
              <p className="text-xs text-slate-500">1 credit = 1 proxy</p>
            </div>
          </div>
          <span className="text-2xl font-bold text-amber-400">{credits}</span>
        </div>

        {success ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">Proxy Deployed</h3>
            <p className="text-sm text-slate-400">Redirecting to dashboard...</p>
          </div>
        ) : (
          <div className="glass rounded-2xl p-8">
            {error && (
              <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Subdomain</label>
                <div className="flex items-stretch">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input type="text" className="input-field pl-10 rounded-r-none border-r-0" placeholder="my-site"
                      value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      required maxLength={32} />
                  </div>
                  <div className="flex items-center px-4 glass rounded-r-lg border-l-0 text-sm text-slate-500 font-mono whitespace-nowrap">.{domain}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Target Backend URL</label>
                <div className="relative">
                  <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="url" className="input-field pl-10" placeholder="https://your-backend-server.com"
                    value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Country / Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <select className="input-field pl-10 appearance-none cursor-pointer" value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}>
                      {countries.map(c => (
                        <option key={c.code} value={c.code} style={{ background: '#0d0d14', color: '#f1f5f9' }}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Expiration <span className="text-slate-600">(optional)</span></label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input type="date" className="input-field pl-10" value={form.expires_at}
                      onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                      min={new Date().toISOString().split('T')[0]} />
                  </div>
                </div>
              </div>

              {form.subdomain && form.target_url && (
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
                  <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-medium">Route Preview</p>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-cyan-400 truncate">{form.subdomain}.{domain}</span>
                    <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    <span className="font-mono text-slate-400 truncate">{form.target_url}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {countries.find(c => c.code === form.country)?.name || form.country}</span>
                    {form.expires_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(form.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Globe className="w-4 h-4" /> Deploy Proxy (1 Credit)</>}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
