import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { ArrowLeft, CreditCard, Check, Loader2, ExternalLink, ShoppingCart } from 'lucide-react';

export default function BuyCredits() {
  const [packages, setPackages] = useState([]);
  const [credits, setCredits] = useState(0);
  const [processing, setProcessing] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/paypal/packages').then(r => r.json()).then(d => setPackages(d.packages || [])).catch(() => {});
    fetch('/api/auth/me').then(r => r.json()).then(d => setCredits(d.user?.credits || 0)).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'cancelled') {
      setError('Payment was cancelled.');
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

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-slate-100 mb-2">Buy Credits</h1>
        <p className="text-sm text-slate-500 mb-8">Purchase credit packages to deploy and manage proxy services</p>

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
              <p className="text-xs text-slate-500">Payments are processed securely through PayPal. You can pay with your PayPal balance, credit card, or debit card. Credits are added instantly after payment.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
