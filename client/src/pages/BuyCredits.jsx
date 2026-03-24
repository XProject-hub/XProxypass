import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { ArrowLeft, CreditCard, Check, Loader2, ExternalLink, ShoppingCart, Zap, Shield, Users } from 'lucide-react';

export default function BuyCredits() {
  const [packages, setPackages] = useState([]);
  const [credits, setCredits] = useState(0);
  const [processing, setProcessing] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [streamPlans, setStreamPlans] = useState({ streaming: [], enterprise: [], reseller: [] });
  const [activeSub, setActiveSub] = useState(null);
  const [viewSection, setViewSection] = useState('credits');

  useEffect(() => {
    fetch('/api/paypal/packages').then(r => r.json()).then(d => setPackages(d.packages || [])).catch(() => {});
    fetch('/api/auth/me').then(r => r.json()).then(d => setCredits(d.user?.credits || 0)).catch(() => {});
    fetch('/api/paypal/stream-plans').then(r => r.json()).then(d => setStreamPlans(d.plans || {})).catch(() => {});
    fetch('/api/paypal/my-subscription').then(r => r.json()).then(d => setActiveSub(d.active)).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'cancelled') {
      setError('Payment was cancelled.');
    }
    if (params.get('subscription') === 'cancelled') {
      setError('Subscription was cancelled.');
    }
    if (params.get('subscription') === 'success') {
      setViewSection('streaming');
      const planId = params.get('plan_id');
      const subId = params.get('subscription_id');
      if (subId) {
        fetch('/api/paypal/activate-subscription', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription_id: subId }),
        }).then(r => r.json()).then(d => {
          if (d.subscription) setActiveSub(d.subscription);
        }).catch(() => {});
      }
    }
  }, []);

  const handleBuy = async (pkg) => {
    setError('');
    setProcessing(pkg.id);

    try {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Payment failed'); setProcessing(null); return; }

      if (data.approve_url) {
        window.location.href = data.approve_url;
      } else {
        setError('PayPal redirect not available');
        setProcessing(null);
      }
    } catch {
      setError('Connection error');
      setProcessing(null);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token && !success) {
      capturePayment(token);
    }
  }, []);

  const capturePayment = async (orderId) => {
    setProcessing('capturing');
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data);
        setCredits(data.new_balance);
        window.history.replaceState({}, '', '/dashboard/buy');
      } else {
        setError(data.error || 'Payment verification failed');
      }
    } catch {
      setError('Failed to verify payment');
    } finally {
      setProcessing(null);
    }
  };

  const handleSubscribe = async (plan) => {
    setError('');
    setProcessing(`sub-${plan.id}`);
    try {
      const res = await fetch('/api/paypal/create-subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setProcessing(null); return; }
      if (data.approve_url) {
        window.location.href = data.approve_url;
      } else {
        setError('PayPal redirect not available');
        setProcessing(null);
      }
    } catch {
      setError('Connection error');
      setProcessing(null);
    }
  };

  const handleCancelSub = async () => {
    if (!confirm('Cancel your subscription? Access continues until the period ends.')) return;
    try {
      const res = await fetch('/api/paypal/cancel-subscription', { method: 'POST' });
      if (res.ok) { setActiveSub(null); }
    } catch {}
  };

  const PLAN_FEATURES = {
    streaming: ['Fair use bandwidth', 'Burst allowed', 'URL rewriting', 'M3U support'],
    enterprise: ['Dedicated bandwidth', 'No throttling', 'Priority routing', 'Premium support'],
    reseller: ['Gbps pool allocation', 'Sub-user management', 'Stream approvals', 'Credit distribution'],
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-slate-100 mb-2">Plans & Credits</h1>
        <p className="text-sm text-slate-500 mb-6">Choose a streaming plan or buy credits for DNS proxies</p>

        {/* Section Tabs */}
        <div className="flex gap-2 mb-8">
          {[
            { id: 'credits', label: 'DNS Proxy Credits', icon: CreditCard },
            { id: 'streaming', label: 'Streaming Plans', icon: Zap },
            { id: 'enterprise', label: 'Enterprise', icon: Shield },
            { id: 'reseller', label: 'Reseller', icon: Users },
          ].map(s => (
            <button key={s.id} onClick={() => setViewSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                viewSection === s.id ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}>
              <s.icon className="w-4 h-4" /> {s.label}
            </button>
          ))}
        </div>

        {/* Active Subscription Banner */}
        {activeSub && (
          <div className="glass rounded-xl p-4 mb-6 border border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-slate-200 font-medium">{activeSub.plan_name}</p>
                <p className="text-xs text-slate-500">{(activeSub.speed_mbps / 1000).toFixed(0)} Gbps - Expires {activeSub.expires_at ? new Date(activeSub.expires_at).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            <button onClick={handleCancelSub} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">Cancel</button>
          </div>
        )}

        {viewSection === 'credits' && (<div>
        <div className="glass rounded-xl p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">Current Balance</p>
              <p className="text-xs text-slate-500">1 credit = 1 proxy / 1 month</p>
            </div>
          </div>
          <span className="text-2xl font-bold text-amber-400">{credits}</span>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
        )}

        {success && (
          <div className="mb-6 glass rounded-xl p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-1">Payment Successful</h3>
            <p className="text-sm text-slate-400 mb-2">+{success.credits_added} credits added to your account</p>
            <p className="text-xs text-slate-500">New balance: <span className="text-amber-400 font-semibold">{success.new_balance}</span> credits</p>
            <Link to="/dashboard/add" className="btn-primary inline-flex items-center gap-2 text-sm mt-5">
              Deploy a Proxy
            </Link>
          </div>
        )}

        {processing === 'capturing' && (
          <div className="mb-6 glass rounded-xl p-8 text-center">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-300">Verifying payment...</p>
          </div>
        )}

        {!success && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map(pkg => (
              <div key={pkg.id} className={`glass rounded-2xl p-6 text-center glass-hover relative ${pkg.id === 'pro' ? 'border-cyan-500/20' : ''}`}>
                {pkg.id === 'pro' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                    Best Value
                  </div>
                )}
                <h3 className="text-lg font-semibold text-slate-100 mt-2 mb-1">{pkg.name}</h3>
                <div className="mb-1">
                  <span className="text-3xl font-bold gradient-text">&euro;{pkg.price}</span>
                </div>
                <p className="text-sm text-cyan-400/60 mb-1">{pkg.credits} credit{pkg.credits > 1 ? 's' : ''}</p>
                <p className="text-[10px] text-slate-600 mb-5">&euro;{(parseFloat(pkg.price) / pkg.credits).toFixed(2)} per credit</p>
                <button
                  onClick={() => handleBuy(pkg)}
                  disabled={processing !== null}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${pkg.id === 'pro' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {processing === pkg.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><ShoppingCart className="w-4 h-4" /> Buy</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="glass rounded-xl p-5 mt-8">
          <div className="flex items-start gap-3">
            <ExternalLink className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-slate-300 mb-1">Secure Payment via PayPal</p>
              <p className="text-xs text-slate-500">Credits are for DNS proxy services. For streaming, choose a Streaming or Enterprise plan.</p>
            </div>
          </div>
        </div>
        </div>)}

        {/* Streaming / Enterprise / Reseller Plans */}
        {(viewSection === 'streaming' || viewSection === 'enterprise' || viewSection === 'reseller') && (
          <div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">
              {viewSection === 'streaming' ? 'Streaming Plans' : viewSection === 'enterprise' ? 'Enterprise Plans' : 'Reseller Plans'}
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              {viewSection === 'streaming' ? 'Fair use streaming with burst support. Optimized for IPTV and streaming workloads.' :
               viewSection === 'enterprise' ? 'Dedicated bandwidth with no throttling. Priority routing and premium support.' :
               'Buy a Gbps pool and distribute bandwidth to your sub-users.'}
            </p>

            {error && <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(streamPlans[viewSection] || []).map((plan, idx) => (
                <div key={plan.id} className={`glass rounded-2xl p-6 text-center glass-hover relative ${idx === 1 ? 'border-cyan-500/20' : ''}`}>
                  {idx === 1 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                      Popular
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-slate-100 mt-2 mb-1">{(plan.speed_mbps / 1000).toFixed(0)} Gbps</h3>
                  <div className="mb-1">
                    <span className="text-3xl font-bold gradient-text">&euro;{plan.price_eur}</span>
                    <span className="text-sm text-slate-500">/mo</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">{plan.description}</p>
                  <ul className="text-left mb-5 space-y-1.5">
                    {(PLAN_FEATURES[viewSection] || []).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                        <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSubscribe(plan)}
                    disabled={processing !== null || !!activeSub}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${idx === 1 ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {processing === `sub-${plan.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : activeSub ? 'Active Plan' : (
                      <><Zap className="w-4 h-4" /> Subscribe</>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {(streamPlans[viewSection] || []).length === 0 && (
              <div className="glass rounded-xl p-8 text-center text-slate-500 text-sm">No plans available</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
