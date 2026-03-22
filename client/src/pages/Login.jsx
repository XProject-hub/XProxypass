import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { LogIn, Mail, Lock, ArrowLeft } from 'lucide-react';

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      setUser(data.user);
      navigate('/dashboard');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-1/3 -left-32 w-[400px] h-[400px] rounded-full bg-cyan-500/[0.05] blur-[120px] animate-float" />
      <div className="absolute bottom-1/3 -right-32 w-[300px] h-[300px] rounded-full bg-blue-600/[0.05] blur-[120px] animate-float-delayed" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-2.5 mb-2">
            <img src="/logo.png" alt="ProxyXPass" className="w-8 h-8 object-contain" />
            <span className="text-lg font-bold text-slate-100">Proxy<span className="gradient-text">XPass</span></span>
          </div>

          <h1 className="text-2xl font-bold text-slate-100 mt-6 mb-1">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-8">Sign in to your account to continue</p>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input
                  type="email"
                  className="input-field pl-10"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input
                  type="password"
                  className="input-field pl-10"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" /> Sign In
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
