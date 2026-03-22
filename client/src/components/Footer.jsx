import { Activity, Github, Globe, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#04040a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-100 tracking-tight">
                Proxy<span className="gradient-text">XPass</span>
              </span>
            </Link>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
              Software-based CDN & Reverse Proxy Service. Deploy your reverse proxy in seconds and bypass network restrictions effortlessly.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Product</h4>
            <ul className="space-y-3">
              <li><a href="#features" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">How It Works</a></li>
              <li><a href="#faq" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Account</h4>
            <ul className="space-y-3">
              <li><Link to="/login" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">Login</Link></li>
              <li><Link to="/register" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">Register</Link></li>
              <li><Link to="/dashboard" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">Dashboard</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            &copy; {new Date().getFullYear()} ProxyXPass. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-slate-600 hover:text-cyan-400 transition-colors">
              <Globe className="w-4 h-4" />
            </a>
            <a href="#" className="text-slate-600 hover:text-cyan-400 transition-colors">
              <Github className="w-4 h-4" />
            </a>
            <a href="#" className="text-slate-600 hover:text-cyan-400 transition-colors">
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
