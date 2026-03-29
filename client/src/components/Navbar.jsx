import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isDashboard = location.pathname.startsWith('/dashboard');
  const isAdmin = location.pathname.startsWith('/admin');
  const isLanding = !isDashboard && !isAdmin;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src="/logo.png" alt="ProxyXPass" className="w-8 h-8 object-contain" />
            <span className="text-lg font-bold text-slate-100 tracking-tight">
              Proxy<span className="gradient-text">XPass</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {isLanding && (
              <>
                <a href="#features" className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition-colors rounded-lg hover:bg-white/[0.03]">
                  Features
                </a>
                <a href="#how-it-works" className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition-colors rounded-lg hover:bg-white/[0.03]">
                  How It Works
                </a>
                <a href="#pricing" className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition-colors rounded-lg hover:bg-white/[0.03]">
                  Pricing
                </a>
                <a href="#faq" className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition-colors rounded-lg hover:bg-white/[0.03]">
                  FAQ
                </a>
                <Link to="/how-to-use" className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition-colors rounded-lg hover:bg-white/[0.03]">
                  Guide
                </Link>
              </>
            )}
            {isDashboard && (
              <>
                <Link to="/dashboard" className={`px-4 py-2 text-sm rounded-lg transition-colors ${location.pathname === '/dashboard' ? 'text-cyan-400 bg-white/[0.05]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'}`}>
                  Overview
                </Link>
                <Link to="/dashboard/add" className={`px-4 py-2 text-sm rounded-lg transition-colors ${location.pathname === '/dashboard/add' ? 'text-cyan-400 bg-white/[0.05]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'}`}>
                  Add Proxy
                </Link>
                <Link to="/dashboard/buy" className={`px-4 py-2 text-sm rounded-lg transition-colors ${location.pathname === '/dashboard/buy' ? 'text-cyan-400 bg-white/[0.05]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'}`}>
                  Buy Credits
                </Link>
                <Link to="/how-to-use" className={`px-4 py-2 text-sm rounded-lg transition-colors ${location.pathname === '/how-to-use' ? 'text-cyan-400 bg-white/[0.05]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'}`}>
                  Guide
                </Link>
              </>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link to="/dashboard" className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors">
                  Dashboard
                </Link>
                <button onClick={logout} className="btn-secondary text-sm" style={{ padding: '0.5rem 1rem' }}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors">
                  Login
                </Link>
                <Link to="/register" className="btn-primary text-sm" style={{ padding: '0.5rem 1.25rem' }}>
                  Get Started
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 text-slate-400 hover:text-slate-100 transition-colors"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#06060a]/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-2">
            {isLanding && (
              <>
                <a href="#features" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.03]">Features</a>
                <a href="#how-it-works" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.03]">How It Works</a>
                <a href="#pricing" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.03]">Pricing</a>
                <a href="#faq" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.03]">FAQ</a>
                <Link to="/how-to-use" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.03]">Guide</Link>
              </>
            )}
            <div className="pt-2 border-t border-white/[0.06] space-y-2">
              {user ? (
                <>
                  <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-white/[0.03]">Dashboard</Link>
                  <button onClick={() => { logout(); setOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-400 rounded-lg hover:bg-white/[0.03]">Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-white/[0.03]">Login</Link>
                  <Link to="/register" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-center btn-primary">Get Started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
