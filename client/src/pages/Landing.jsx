import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  Shield, Zap, LayoutDashboard, Users, HeadphonesIcon,
  Globe, UserPlus, ArrowRight, MousePointer, Server, Activity
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import FeatureCard from '../components/FeatureCard';
import FAQItem from '../components/FAQItem';

function AnimatedCounter({ value, label, icon: Icon }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const animated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          const target = value;
          const duration = 2000;
          const steps = 60;
          const increment = target / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <div className="flex items-center justify-center mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
      </div>
      <div className="text-3xl md:text-4xl font-bold text-slate-100 mb-1">
        {count.toLocaleString()}
      </div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default function Landing() {
  const [stats, setStats] = useState({ total_users: 0, total_proxies: 0, total_requests: 0 });

  useEffect(() => {
    fetch('/api/stats/global')
      .then(r => r.json())
      .then(data => setStats(data.stats))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full bg-cyan-500/[0.07] blur-[120px] animate-float" />
        <div className="absolute bottom-1/4 -right-32 w-[400px] h-[400px] rounded-full bg-blue-600/[0.07] blur-[120px] animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-purple-600/[0.04] blur-[100px] animate-float-slow" />

        <div className="relative z-10 text-center max-w-4xl mx-auto px-4 pt-20">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">Software-based CDN & Proxy Service</span>
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <span className="text-slate-100">Say NO to</span>
            <br />
            <span className="gradient-text">Network Issues</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Deploy reverse proxies and IPTV stream proxies in seconds. Route traffic through our distributed Gbps network. Your real server IP stays hidden.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Link to="/register" className="btn-primary text-base px-8 py-3.5 flex items-center justify-center gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#features" className="btn-secondary text-base px-8 py-3.5 flex items-center justify-center">
              Learn More
            </a>
          </div>

          <div className="mt-20 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
            <div className="glass rounded-2xl p-8 max-w-xl mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="font-mono text-sm text-slate-400 text-left space-y-2">
                <p><span className="text-cyan-400">$</span> proxyxpass add --subdomain mysite</p>
                <p className="text-slate-600">  Target URL: https://my-backend.com</p>
                <p className="text-emerald-400/70">  Proxy deployed at mysite.yourdomain.com</p>
                <p className="text-slate-600">  Status: <span className="text-emerald-400/70">active</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <MousePointer className="w-5 h-5 text-slate-600 rotate-180" />
        </div>
      </section>

      {/* Stats - Real Data */}
      <section className="relative py-20 border-y border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <AnimatedCounter icon={Users} value={stats.total_users} label="Registered Users" />
            <AnimatedCounter icon={Globe} value={stats.total_proxies} label="Active Proxies" />
            <AnimatedCounter icon={Activity} value={stats.total_requests} label="Total Requests" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              Why Choose <span className="gradient-text">ProxyXPass</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Everything you need to proxy, protect, and accelerate your web services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <FeatureCard
              icon={Shield}
              title="99.9% Uptime"
              description="Distributed network with health monitoring. Auto-failover keeps your proxies always online."
            />
            <FeatureCard
              icon={LayoutDashboard}
              title="Easy Dashboard"
              description="Deploy DNS or Stream proxies in seconds. Manage everything from one intuitive panel."
            />
            <FeatureCard
              icon={Zap}
              title="IPTV / Streaming"
              description="M3U playlist rewriting, Xtream Codes API support, HLS segment proxying. All major IPTV apps supported."
            />
            <FeatureCard
              icon={HeadphonesIcon}
              title="Live Support"
              description="Get help when you need it. Our support team is available on Discord."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
            <FeatureCard
              icon={Activity}
              title="Gbps Speed Plans"
              description="Choose from 1-5 Gbps plans. Fair use streaming or dedicated enterprise bandwidth."
            />
            <FeatureCard
              icon={Server}
              title="Multi-Port Support"
              description="Ports 25461, 8080, 8880, 8443, 1935 and more. IPTV apps connect on their original port."
            />
            <FeatureCard
              icon={Users}
              title="Reseller Program"
              description="Buy a Gbps pool and distribute to sub-users. Full management panel with credit system."
            />
            <FeatureCard
              icon={Globe}
              title="Multi-Country"
              description="Route traffic through VPS nodes worldwide. Choose your country for optimal routing."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative py-24 md:py-32 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              How to <span className="gradient-text">Get Started</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Three simple steps to deploy your reverse proxy service.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', icon: UserPlus, title: 'Create Account', desc: 'Sign up for free. Buy credits for DNS proxies or purchase a Gbps streaming plan.' },
              { step: '02', icon: Globe, title: 'Deploy Proxy', desc: 'Enter your backend URL, choose a subdomain and country. For IPTV, request Stream Proxy mode.' },
              { step: '03', icon: Zap, title: 'Go Live', desc: 'Your proxy is live instantly. All URLs rewritten, real server IP completely hidden.' },
            ].map((item) => (
              <div key={item.step} className="glass rounded-2xl p-8 text-center glass-hover relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold gradient-text bg-[#06060a] border border-white/[0.06]">
                  Step {item.step}
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/10 flex items-center justify-center mx-auto mb-5 mt-2">
                  <item.icon className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-100 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative py-24 md:py-32 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              Simple <span className="gradient-text">Pricing</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              DNS Proxy credits for web proxying, or Gbps streaming plans for IPTV and high-bandwidth use.
            </p>
          </div>

          {/* DNS Proxy Credits */}
          <div className="mb-12">
            <h3 className="text-xl font-bold text-slate-200 mb-2 text-center">DNS Proxy</h3>
            <p className="text-sm text-slate-500 mb-6 text-center">Web proxying with full URL rewriting. Pay per proxy per month.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-4xl mx-auto">
              {[
                { name: 'Starter', credits: 1, price: '7', perCredit: '7.00', desc: 'Try the service' },
                { name: 'Basic', credits: 5, price: '30', perCredit: '6.00', desc: 'Small projects' },
                { name: 'Pro', credits: 10, price: '50', perCredit: '5.00', desc: 'Best value', popular: true },
                { name: 'Business', credits: 25, price: '100', perCredit: '4.00', desc: 'Power users' },
              ].map((plan) => (
                <div key={plan.name} className={`glass rounded-2xl p-5 text-center glass-hover relative ${plan.popular ? 'border-cyan-500/20' : ''}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                      Best Value
                    </div>
                  )}
                  <h3 className="text-base font-semibold text-slate-100 mt-1 mb-1">{plan.name}</h3>
                  <div className="mb-1">
                    <span className="text-2xl font-bold gradient-text">&euro;{plan.price}</span>
                  </div>
                  <p className="text-xs text-cyan-400/60 mb-1">{plan.credits} credit{plan.credits > 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-slate-600 mb-4">{plan.desc}</p>
                  <Link to="/register" className={`w-full inline-flex items-center justify-center py-2 rounded-lg text-sm font-medium transition-all ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}>
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Streaming Plans */}
          <div className="mb-12">
            <h3 className="text-xl font-bold text-slate-200 mb-2 text-center">
              <span className="gradient-text">Streaming Plans</span>
            </h3>
            <p className="text-sm text-slate-500 mb-6 text-center">IPTV & video streaming proxy with Gbps speed. Fair use with burst support. 1 to 50 Gbps.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { speed: '1', price: '99' },
                { speed: '2', price: '179' },
                { speed: '3', price: '249', popular: true },
                { speed: '5', price: '399' },
                { speed: '10', price: '699' },
              ].map((plan) => (
                <div key={plan.speed} className={`glass rounded-2xl p-5 text-center glass-hover relative ${plan.popular ? 'border-cyan-500/20' : ''}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                      Popular
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-slate-100 mt-2 mb-1">{plan.speed} Gbps</h3>
                  <div className="mb-1">
                    <span className="text-2xl font-bold gradient-text">&euro;{plan.price}</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Fair use</p>
                  <Link to="/register" className={`w-full inline-flex items-center justify-center py-2 rounded-lg text-xs font-medium transition-all ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}>
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 max-w-4xl mx-auto">
              {[
                { speed: '20', price: '1,299' },
                { speed: '30', price: '1,799' },
                { speed: '40', price: '2,299' },
                { speed: '50', price: '2,799' },
              ].map((plan) => (
                <div key={plan.speed} className="glass rounded-2xl p-5 text-center glass-hover">
                  <h3 className="text-xl font-bold text-slate-100 mb-1">{plan.speed} Gbps</h3>
                  <div className="mb-1">
                    <span className="text-2xl font-bold gradient-text">&euro;{plan.price}</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Fair use</p>
                  <Link to="/register" className="w-full inline-flex items-center justify-center py-2 rounded-lg text-xs font-medium transition-all btn-secondary">
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
            <div className="glass rounded-lg p-4 mt-4 max-w-2xl mx-auto">
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {['M3U / Xtream Codes', 'URL rewriting', 'Burst allowed', 'Multi-port support'].map((f, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Enterprise Plans */}
          <div className="mb-12">
            <h3 className="text-xl font-bold text-slate-200 mb-2 text-center">
              <span className="text-amber-400">Enterprise</span>
            </h3>
            <p className="text-sm text-slate-500 mb-6 text-center">Dedicated bandwidth, no throttling, priority routing, premium support. 1 to 50 Gbps.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { speed: '1', price: '249' },
                { speed: '2', price: '399' },
                { speed: '3', price: '599', popular: true },
                { speed: '5', price: '999' },
                { speed: '10', price: '1,799' },
              ].map((plan) => (
                <div key={plan.speed} className={`glass rounded-2xl p-5 text-center glass-hover relative ${plan.popular ? 'border-amber-500/20' : ''}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                      Popular
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-slate-100 mt-2 mb-1">{plan.speed} Gbps</h3>
                  <div className="mb-1">
                    <span className="text-2xl font-bold text-amber-400">&euro;{plan.price}</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Dedicated</p>
                  <Link to="/register" className={`w-full inline-flex items-center justify-center py-2 rounded-lg text-xs font-medium transition-all ${plan.popular ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90' : 'btn-secondary'}`}>
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 max-w-4xl mx-auto">
              {[
                { speed: '20', price: '3,199' },
                { speed: '30', price: '4,499' },
                { speed: '40', price: '5,799' },
                { speed: '50', price: '6,999' },
              ].map((plan) => (
                <div key={plan.speed} className="glass rounded-2xl p-5 text-center glass-hover">
                  <h3 className="text-xl font-bold text-slate-100 mb-1">{plan.speed} Gbps</h3>
                  <div className="mb-1">
                    <span className="text-2xl font-bold text-amber-400">&euro;{plan.price}</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Dedicated</p>
                  <Link to="/register" className="w-full inline-flex items-center justify-center py-2 rounded-lg text-xs font-medium transition-all btn-secondary">
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
            <div className="glass rounded-lg p-4 mt-4 max-w-2xl mx-auto">
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {['No throttling', 'Priority routing', 'Premium support', 'Dedicated resources'].map((f, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-amber-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Reseller */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-slate-200 mb-2 text-center">
              <span className="text-purple-400">Reseller Program</span>
            </h3>
            <p className="text-sm text-slate-500 mb-6 text-center">
              Buy a Gbps pool and distribute bandwidth to your sub-users. Full management panel included.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { pool: '5', price: '399', users: '~25', desc: 'Small reseller' },
                { pool: '10', price: '699', users: '~50', desc: 'Growing business', popular: true },
                { pool: '20', price: '1,199', users: '~100', desc: 'Established reseller' },
                { pool: '50', price: '2,499', users: '~250', desc: 'Large operation' },
              ].map((plan) => (
                <div key={plan.pool} className={`glass rounded-2xl p-6 text-center glass-hover relative ${plan.popular ? 'border-purple-500/20' : ''}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                      Popular
                    </div>
                  )}
                  <h3 className="text-2xl font-bold text-slate-100 mt-2 mb-1">{plan.pool} Gbps</h3>
                  <div className="mb-1">
                    <span className="text-3xl font-bold text-purple-400">&euro;{plan.price}</span>
                    <span className="text-sm text-slate-500">/mo</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">{plan.desc} ({plan.users} users)</p>
                  <ul className="text-left mb-5 space-y-1.5 px-2">
                    {['Gbps pool allocation', 'Sub-user management', 'Stream approvals', 'Credit distribution'].map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="w-1 h-1 rounded-full bg-purple-400 flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/register" className={`w-full inline-flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-all ${plan.popular ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90' : 'btn-secondary'}`}>
                    Become Reseller
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="glass rounded-lg p-4 mt-8 max-w-md mx-auto">
            <p className="text-center text-sm text-slate-400">
              <span className="text-slate-300 font-medium">Payment Methods:</span> BTC, ETH, USDT + 300 cryptocurrencies
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative py-24 md:py-32 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              Frequently Asked <span className="gradient-text">Questions</span>
            </h2>
          </div>

          <div className="space-y-3">
            <FAQItem
              question="What is ProxyXPass?"
              answer="ProxyXPass is a software-based CDN and reverse proxy service. It allows you to create proxy endpoints for your websites and IPTV streams, routing traffic through our distributed network. Your real server IP stays completely hidden."
            />
            <FAQItem
              question="What is the difference between DNS Proxy and Streaming plans?"
              answer="DNS Proxy is for regular websites - it rewrites URLs in HTML/CSS/JS responses. Streaming plans are for IPTV and video - they rewrite M3U playlists, Xtream Codes API responses, follow redirects, and handle high-bandwidth .ts segment proxying with Gbps speed limits."
            />
            <FAQItem
              question="How do Streaming plans work?"
              answer="Purchase a Gbps plan (e.g. 1 Gbps for 99 EUR/month). Create a proxy pointing to your IPTV backend, then request Stream Proxy mode. Once approved, your proxy gets the speed limit from your plan. All M3U and API responses are rewritten automatically."
            />
            <FAQItem
              question="What IPTV apps are supported?"
              answer="ProxyXPass works with all major IPTV apps: Smarters Pro, TiviMate, XCIPTV, VLC, GSE Smart, and any app that uses Xtream Codes API or M3U playlists. Multi-port support (25461, 8080, 8880, etc.) is included."
            />
            <FAQItem
              question="What is the Reseller program?"
              answer="Resellers buy a Gbps bandwidth pool (e.g. 10 Gbps for 699 EUR/month) and distribute it to their sub-users. You get a full management panel with user creation, credit distribution, stream approvals, and speed allocation per user."
            />
            <FAQItem
              question="Does ProxyXPass support WebSockets?"
              answer="Yes. Full WebSocket proxying is supported for both DNS and Stream proxies. All upgrade requests are automatically proxied to your backend server."
            />
            <FAQItem
              question="What about HTTPS and SSL?"
              answer="SSL termination is handled automatically. All proxy endpoints work on HTTPS with Let's Encrypt certificates. Multi-port support is included for IPTV-specific ports."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 md:py-32 border-t border-white/[0.04]">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-cyan-500/[0.05] blur-[120px]" />
        <div className="relative z-10 text-center max-w-2xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
            Ready to <span className="gradient-text">Get Started?</span>
          </h2>
          <p className="text-slate-400 mb-8">
            Create your account and deploy your first proxy in under a minute.
          </p>
          <Link to="/register" className="btn-primary text-base px-10 py-4 inline-flex items-center gap-2">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
