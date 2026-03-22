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
            Deploy your reverse proxy in seconds. Route traffic through our distributed network and eliminate connectivity problems.
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
              description="We guarantee our network will be up and functioning 99.9% of the time. Built for reliability."
            />
            <FeatureCard
              icon={LayoutDashboard}
              title="Easy Dashboard"
              description="Intuitive control panel to manage all your proxy services. Deploy in seconds, not hours."
            />
            <FeatureCard
              icon={Users}
              title="Referral Program"
              description="Share our services and earn rewards. Your referrals get premium benefits too."
            />
            <FeatureCard
              icon={HeadphonesIcon}
              title="Live Support"
              description="Get help when you need it. Our support team is available Monday through Friday."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
            <FeatureCard
              icon={Zap}
              title="Lightning Fast"
              description="Optimized routing through our CDN network ensures minimal latency for all proxied traffic."
            />
            <FeatureCard
              icon={Server}
              title="WebSocket Support"
              description="Full WebSocket proxying support for real-time applications and live connections."
            />
            <FeatureCard
              icon={Activity}
              title="Real-time Analytics"
              description="Monitor your proxy traffic with detailed request statistics and performance metrics."
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
              { step: '01', icon: UserPlus, title: 'Create Account', desc: 'Sign up for free in seconds. No credit card required to get started.' },
              { step: '02', icon: Globe, title: 'Deploy Proxy', desc: 'Enter your backend URL, choose a subdomain, and deploy your proxy instantly.' },
              { step: '03', icon: Zap, title: 'Go Live', desc: 'Your proxy is live. Access your site through our CDN with zero downtime.' },
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-4">
              Simple <span className="gradient-text">Pricing</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Purchase credit packages. 1 credit = 1 proxy for 1 month. Renew anytime to extend.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { name: 'Starter', credits: 1, price: '$8', perCredit: '$8.00', desc: 'Try the service with a single proxy' },
              { name: 'Basic', credits: 5, price: '$35', perCredit: '$7.00', desc: 'Perfect for small projects' },
              { name: 'Pro', credits: 10, price: '$60', perCredit: '$6.00', desc: 'Best value for regular users', popular: true },
              { name: 'Business', credits: 25, price: '$125', perCredit: '$5.00', desc: 'Maximum savings for power users' },
            ].map((plan) => (
              <div key={plan.name} className={`glass rounded-2xl p-6 text-center glass-hover relative ${plan.popular ? 'border-cyan-500/20' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                    Best Value
                  </div>
                )}
                <h3 className="text-lg font-semibold text-slate-100 mt-2 mb-1">{plan.name}</h3>
                <div className="mb-1">
                  <span className="text-3xl font-bold gradient-text">{plan.price}</span>
                </div>
                <p className="text-xs text-cyan-400/60 mb-1">{plan.credits} credit{plan.credits > 1 ? 's' : ''}</p>
                <p className="text-[10px] text-slate-600 mb-4">{plan.perCredit} per credit</p>
                <p className="text-xs text-slate-500 mb-5">{plan.desc}</p>
                <Link to="/register" className={`w-full inline-flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-all ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}>
                  Get Started
                </Link>
              </div>
            ))}
          </div>

          <div className="glass rounded-xl p-5 mt-8 max-w-2xl mx-auto">
            <div className="text-center">
              <p className="text-sm text-slate-300 mb-2">How credits work</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-500">
                <div>1 credit = 1 proxy / 1 month</div>
                <div>2 credits = 1 proxy / 3 months</div>
                <div>6 credits = 1 proxy / 12 months</div>
              </div>
              <p className="text-xs text-slate-600 mt-3">You can also renew existing proxies to extend their duration.</p>
            </div>
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
              answer="ProxyXPass is a software-based CDN and reverse proxy service. It allows you to create proxy endpoints for your websites, routing traffic through our distributed network for better performance and reliability."
            />
            <FAQItem
              question="How do I use ProxyXPass?"
              answer="Simply create an account, go to your dashboard, and add a new proxy. Enter your backend URL (e.g., https://your-site.com) and choose a subdomain. Your proxy will be deployed instantly and accessible via your-subdomain.yourdomain.com."
            />
            <FAQItem
              question="Does ProxyXPass forward the real IP?"
              answer="Yes. ProxyXPass forwards the original visitor's IP address through the X-Forwarded-For and X-Real-IP headers. Your backend service can read these headers to get the actual client IP address."
            />
            <FAQItem
              question="Does ProxyXPass support WebSockets?"
              answer="Yes. ProxyXPass fully supports WebSocket connections. All WebSocket upgrade requests are automatically proxied to your backend server, enabling real-time applications to work seamlessly."
            />
            <FAQItem
              question="What about HTTPS and SSL?"
              answer="ProxyXPass handles SSL termination automatically. Your proxy endpoints are accessible via both HTTP and HTTPS. SSL certificates are provisioned and renewed automatically using Let's Encrypt."
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
