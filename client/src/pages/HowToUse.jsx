import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Globe, Server, Shield, Zap, Play, Key, RefreshCw, Lock, Edit, Trash2, MonitorPlay, Users, ChevronDown } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useState } from 'react';

function GuideSection({ id, icon: Icon, title, color = 'cyan', children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 border border-${color}-500/10 flex items-center justify-center`}>
          <Icon className={`w-5 h-5 text-${color}-400`} />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-100">{title}</h2>
      </div>
      <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Step({ number, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
        <span className="text-xs font-bold text-cyan-400">{number}</span>
      </div>
      <div className="flex-1 pt-1">
        <p className="text-slate-200 font-medium mb-1">{title}</p>
        <div className="text-slate-400">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ children }) {
  return (
    <div className="glass rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto">
      {children}
    </div>
  );
}

function QuickNav({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-xl p-4 mb-8 lg:hidden">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-sm text-slate-300">
        <span className="font-medium">Quick Navigation</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <nav className="mt-3 space-y-1">
          {items.map(item => (
            <a key={item.id} href={`#${item.id}`} onClick={() => setOpen(false)}
              className="block px-3 py-2 text-xs text-slate-400 hover:text-cyan-400 rounded-lg hover:bg-white/[0.03] transition-colors">
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'buy-credits', label: 'Buying Credits' },
  { id: 'deploy-proxy', label: 'Deploy DNS Proxy' },
  { id: 'manage-proxy', label: 'Managing Proxies' },
  { id: 'streaming', label: 'Streaming Proxy' },
  { id: 'stream-tokens', label: 'Stream Tokens (IPTV)' },
  { id: 'ip-whitelist', label: 'IP Whitelisting' },
  { id: 'renew', label: 'Renewing Proxies' },
  { id: 'reseller', label: 'Reseller Program' },
];

export default function HowToUse() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-100 mb-3">
            How to <span className="gradient-text">Use ProxyXPass</span>
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Complete guide to setting up and managing your reverse proxy and streaming services. Follow these steps to get started.
          </p>
        </div>

        <QuickNav items={NAV_ITEMS} />

        <div className="flex gap-10">
          {/* Sidebar - desktop only */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <nav className="sticky top-24 space-y-1">
              {NAV_ITEMS.map(item => (
                <a key={item.id} href={`#${item.id}`}
                  className="block px-3 py-2 text-xs text-slate-500 hover:text-cyan-400 rounded-lg hover:bg-white/[0.03] transition-colors">
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-16">

            {/* Getting Started */}
            <GuideSection id="getting-started" icon={Shield} title="Getting Started">
              <p>To use ProxyXPass, you first need to create an account. Registration is free.</p>
              <div className="space-y-4 mt-4">
                <Step number="1" title="Create your account">
                  <p>Go to the <Link to="/register" className="text-cyan-400 hover:underline">Register</Link> page. Enter your email, username, and a strong password. Click "Create Account".</p>
                </Step>
                <Step number="2" title="Log in to your dashboard">
                  <p>After registering, go to the <Link to="/login" className="text-cyan-400 hover:underline">Login</Link> page and sign in with your credentials. You will be redirected to your dashboard.</p>
                </Step>
                <Step number="3" title="Choose your service">
                  <p>From the dashboard, you can either buy credits for <strong className="text-slate-300">DNS Proxy</strong> (website proxying) or purchase a <strong className="text-slate-300">Streaming Plan</strong> (IPTV/video proxying).</p>
                </Step>
              </div>
            </GuideSection>

            {/* Buying Credits */}
            <GuideSection id="buy-credits" icon={CreditCard} title="Buying Credits" color="amber">
              <p>Credits are used to deploy and renew DNS proxies. 1 credit = 1 proxy for 1 month.</p>

              <div className="glass rounded-xl p-5 mt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Available Packages</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { name: 'Starter', credits: 1, price: '7' },
                    { name: 'Basic', credits: 5, price: '30' },
                    { name: 'Pro', credits: 10, price: '50' },
                    { name: 'Business', credits: 25, price: '100' },
                  ].map(p => (
                    <div key={p.name} className="text-center p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <p className="text-slate-300 font-medium text-xs">{p.name}</p>
                      <p className="text-amber-400 font-bold text-lg">&euro;{p.price}</p>
                      <p className="text-slate-500 text-[10px]">{p.credits} credit{p.credits > 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Go to Buy Credits">
                  <p>From your dashboard, click <strong className="text-slate-300">"Buy Credits"</strong> in the navigation bar, or go to <Link to="/dashboard/buy" className="text-cyan-400 hover:underline">Dashboard &gt; Buy Credits</Link>.</p>
                </Step>
                <Step number="2" title="Select a package">
                  <p>Choose the credit package that fits your needs. Under the <strong className="text-slate-300">"DNS Proxy Credits"</strong> tab, click <strong className="text-slate-300">"Pay with Crypto"</strong> on the package you want.</p>
                </Step>
                <Step number="3" title="Complete payment">
                  <p>You will be redirected to the payment page. Send the exact amount in your chosen cryptocurrency (BTC, ETH, USDT, or 300+ others). The page will show you the wallet address and amount to send.</p>
                </Step>
                <Step number="4" title="Wait for confirmation">
                  <p>After sending the payment, wait for blockchain confirmation. This usually takes a few minutes depending on the cryptocurrency. Your credits will be added automatically once confirmed.</p>
                </Step>
              </div>

              <div className="glass rounded-lg p-4 border-l-2 border-amber-500/40 mt-4">
                <p className="text-slate-300 text-xs font-medium mb-1">Important</p>
                <p className="text-xs">Always send the exact amount shown. Sending less may result in a failed payment. If you have any issues, contact support.</p>
              </div>
            </GuideSection>

            {/* Deploy DNS Proxy */}
            <GuideSection id="deploy-proxy" icon={Globe} title="Deploy a DNS Proxy">
              <p>A DNS Proxy creates a reverse proxy endpoint for your website. All traffic goes through ProxyXPass, hiding your real server IP.</p>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Click 'Add Proxy'">
                  <p>From your dashboard, click <strong className="text-slate-300">"Add Proxy"</strong> in the navigation bar, or go to <Link to="/dashboard/add" className="text-cyan-400 hover:underline">Dashboard &gt; Add Proxy</Link>.</p>
                </Step>
                <Step number="2" title="Enter subdomain">
                  <p>Choose a subdomain name for your proxy. For example, entering <code className="text-cyan-400 bg-white/[0.03] px-1.5 py-0.5 rounded text-xs">my-site</code> will create <code className="text-cyan-400 bg-white/[0.03] px-1.5 py-0.5 rounded text-xs">my-site.proxyxpass.com</code>.</p>
                </Step>
                <Step number="3" title="Enter your backend URL">
                  <p>Enter the full URL of your backend server. For example: <code className="text-cyan-400 bg-white/[0.03] px-1.5 py-0.5 rounded text-xs">https://my-real-server.com</code>. This is the server you want to protect.</p>
                </Step>
                <Step number="4" title="Select country/location">
                  <p>Choose the country where your proxy traffic should be routed. Select <strong className="text-slate-300">"Auto (Direct)"</strong> if you don't have a preference, or pick a specific country for optimal routing.</p>
                </Step>
                <Step number="5" title="Select validity period">
                  <p>Choose how long the proxy should be active:</p>
                  <ul className="list-none space-y-1 mt-2">
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-cyan-400" /> 1 Month - 1 credit</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-cyan-400" /> 3 Months - 2 credits</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-cyan-400" /> 6 Months - 4 credits</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-cyan-400" /> 12 Months - 6 credits</li>
                  </ul>
                </Step>
                <Step number="6" title="Deploy">
                  <p>Click <strong className="text-slate-300">"Deploy Proxy"</strong>. Your credits will be deducted and the proxy will be active immediately.</p>
                </Step>
              </div>

              <div className="glass rounded-xl p-5 mt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Example</p>
                <CodeBlock>
                  <p><span className="text-slate-500">Subdomain:</span> <span className="text-cyan-400">my-site</span></p>
                  <p><span className="text-slate-500">Backend URL:</span> <span className="text-cyan-400">https://192.168.1.100:8080</span></p>
                  <p><span className="text-slate-500">Country:</span> <span className="text-cyan-400">US - United States (Chicago)</span></p>
                  <p><span className="text-slate-500">Validity:</span> <span className="text-cyan-400">1 Month - 1 credit</span></p>
                  <p className="mt-2"><span className="text-slate-500">Result:</span> <span className="text-emerald-400">my-site.proxyxpass.com</span> <span className="text-slate-600">-&gt;</span> <span className="text-slate-400">https://192.168.1.100:8080</span></p>
                </CodeBlock>
              </div>
            </GuideSection>

            {/* Managing Proxies */}
            <GuideSection id="manage-proxy" icon={Edit} title="Managing Your Proxies">
              <p>From your dashboard, you can manage all your active proxies.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="glass rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="w-4 h-4 text-emerald-400" />
                    <p className="text-slate-200 font-medium text-sm">Enable / Disable</p>
                  </div>
                  <p className="text-xs">Toggle your proxy on or off. Disabled proxies stop routing traffic but keep your configuration.</p>
                </div>
                <div className="glass rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Edit className="w-4 h-4 text-cyan-400" />
                    <p className="text-slate-200 font-medium text-sm">Edit Settings</p>
                  </div>
                  <p className="text-xs">Change your subdomain, backend URL, or country at any time from the proxy card on your dashboard.</p>
                </div>
                <div className="glass rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="w-4 h-4 text-amber-400" />
                    <p className="text-slate-200 font-medium text-sm">Renew</p>
                  </div>
                  <p className="text-xs">Extend your proxy before it expires. Select a new validity period and pay with credits. Time is added to the existing expiry date.</p>
                </div>
                <div className="glass rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <p className="text-slate-200 font-medium text-sm">Delete</p>
                  </div>
                  <p className="text-xs">Permanently remove a proxy. This action cannot be undone. Credits are not refunded.</p>
                </div>
              </div>
            </GuideSection>

            {/* Streaming Proxy */}
            <GuideSection id="streaming" icon={MonitorPlay} title="Streaming Proxy (IPTV)" color="purple">
              <p>Streaming proxies are designed for IPTV and video content. They rewrite M3U playlists, handle Xtream Codes API responses, and proxy high-bandwidth .ts segments.</p>

              <div className="glass rounded-lg p-4 border-l-2 border-purple-500/40 mt-2">
                <p className="text-slate-300 text-xs font-medium mb-1">Requires a Streaming Plan</p>
                <p className="text-xs">To use streaming proxy features, you must first purchase a streaming plan from the <Link to="/dashboard/buy" className="text-cyan-400 hover:underline">Buy Credits</Link> page under the "Streaming Plans" tab.</p>
              </div>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Purchase a Streaming Plan">
                  <p>Go to <strong className="text-slate-300">Buy Credits &gt; Streaming Plans</strong>. Choose a plan based on speed (1 Gbps to 50 Gbps). Pay with crypto.</p>
                </Step>
                <Step number="2" title="Create a proxy">
                  <p>Deploy a DNS proxy pointing to your IPTV backend server (e.g., <code className="text-cyan-400 bg-white/[0.03] px-1.5 py-0.5 rounded text-xs">http://your-iptv-server.com:8080</code>).</p>
                </Step>
                <Step number="3" title="Request Stream Mode">
                  <p>On your proxy card in the dashboard, click <strong className="text-slate-300">"Request Stream"</strong>. This sends a request to the admin for approval.</p>
                </Step>
                <Step number="4" title="Wait for approval">
                  <p>The admin will review and approve your stream proxy request. Once approved, your proxy will switch to streaming mode with your plan's speed limit.</p>
                </Step>
                <Step number="5" title="Use your proxy">
                  <p>Replace your IPTV server URL with your proxy URL in your IPTV app. All supported formats work automatically:</p>
                  <ul className="list-none space-y-1 mt-2">
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-purple-400" /> M3U / M3U8 playlists</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-purple-400" /> Xtream Codes API</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-purple-400" /> HLS segments (.ts)</li>
                    <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-purple-400" /> Multi-port (25461, 8080, 8880, 8443, 1935)</li>
                  </ul>
                </Step>
              </div>

              <div className="glass rounded-xl p-5 mt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Xtream Codes Example</p>
                <CodeBlock>
                  <p className="text-slate-500 mb-2">Before (original):</p>
                  <p>http://<span className="text-red-400">your-iptv-server.com</span>:8080/get.php?username=user&amp;password=pass&amp;type=m3u_plus</p>
                  <p className="text-slate-500 mt-3 mb-2">After (with ProxyXPass):</p>
                  <p>http://<span className="text-emerald-400">my-proxy.proxyxpass.com</span>:8080/get.php?username=user&amp;password=pass&amp;type=m3u_plus</p>
                </CodeBlock>
              </div>

              <div className="glass rounded-xl p-5 mt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Supported IPTV Apps</p>
                <div className="flex flex-wrap gap-2">
                  {['Smarters Pro', 'TiviMate', 'XCIPTV', 'VLC', 'GSE Smart IPTV', 'iPlayTV', 'OTT Navigator', 'Kodi'].map(app => (
                    <span key={app} className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300">{app}</span>
                  ))}
                </div>
              </div>
            </GuideSection>

            {/* Stream Tokens */}
            <GuideSection id="stream-tokens" icon={Key} title="Stream Tokens" color="amber">
              <p>Stream tokens allow you to create temporary, shareable URLs for your streaming proxy. Each token has an expiry time.</p>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Open your streaming proxy">
                  <p>On your dashboard, find the proxy that has streaming mode approved and expand its details.</p>
                </Step>
                <Step number="2" title="Generate a token">
                  <p>Click <strong className="text-slate-300">"Generate Token"</strong>. Choose the duration (e.g., 24 hours). Optionally enter IPTV credentials (username/password) to embed them in the token.</p>
                </Step>
                <Step number="3" title="Share the URL">
                  <p>Copy the generated stream URL and share it. The URL will look like:</p>
                  <CodeBlock>
                    <p>http://my-proxy.proxyxpass.com/stream/abc123def456...</p>
                  </CodeBlock>
                </Step>
              </div>

              <div className="glass rounded-lg p-4 border-l-2 border-amber-500/40 mt-4">
                <p className="text-slate-300 text-xs font-medium mb-1">Token Expiry</p>
                <p className="text-xs">Tokens expire automatically after the duration you set. You can also manually revoke tokens from the dashboard at any time.</p>
              </div>
            </GuideSection>

            {/* IP Whitelisting */}
            <GuideSection id="ip-whitelist" icon={Lock} title="IP Whitelisting">
              <p>IP whitelisting allows you to restrict access to your proxy so only specific IP addresses can use it.</p>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Open proxy settings">
                  <p>On your dashboard, find the proxy you want to protect and look for the IP whitelist section.</p>
                </Step>
                <Step number="2" title="Add IP addresses">
                  <p>Enter the IP address you want to allow and click "Add". You can add multiple IPs. Only these IPs will be able to access the proxy.</p>
                </Step>
                <Step number="3" title="Remove IPs">
                  <p>To remove an IP from the whitelist, click the remove button next to it. If the whitelist is empty, all IPs are allowed (no restriction).</p>
                </Step>
              </div>

              <div className="glass rounded-lg p-4 border-l-2 border-cyan-500/40 mt-4">
                <p className="text-slate-300 text-xs font-medium mb-1">Tip</p>
                <p className="text-xs">If you are using IPTV, whitelist your home IP address to prevent unauthorized access to your streams.</p>
              </div>
            </GuideSection>

            {/* Renewing */}
            <GuideSection id="renew" icon={RefreshCw} title="Renewing Proxies" color="emerald">
              <p>Proxies expire after their validity period. You can renew them before or after expiry to keep them active.</p>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Find the proxy">
                  <p>On your dashboard, proxies nearing expiration will show a warning. Expired proxies will be marked as inactive.</p>
                </Step>
                <Step number="2" title="Click Renew">
                  <p>Click the <strong className="text-slate-300">"Renew"</strong> button on the proxy card.</p>
                </Step>
                <Step number="3" title="Select validity">
                  <p>Choose a new validity period (1, 3, 6, or 12 months). The time will be added to the current expiry date if the proxy hasn't expired yet.</p>
                </Step>
                <Step number="4" title="Confirm">
                  <p>Credits will be deducted from your balance and the proxy will be renewed.</p>
                </Step>
              </div>
            </GuideSection>

            {/* Reseller */}
            <GuideSection id="reseller" icon={Users} title="Reseller Program" color="purple">
              <p>The reseller program allows you to buy a Gbps bandwidth pool and distribute it to your own sub-users.</p>

              <div className="space-y-4 mt-4">
                <Step number="1" title="Purchase a Reseller Plan">
                  <p>Go to <strong className="text-slate-300">Buy Credits &gt; Streaming Plans</strong> and select a Reseller plan. These come with a Gbps bandwidth pool that you can distribute.</p>
                </Step>
                <Step number="2" title="Access Reseller Panel">
                  <p>After your plan is activated, you will have access to the Reseller panel where you can manage sub-users.</p>
                </Step>
                <Step number="3" title="Create sub-users">
                  <p>Create accounts for your customers. Each sub-user gets their own login and dashboard.</p>
                </Step>
                <Step number="4" title="Distribute bandwidth">
                  <p>Allocate speed limits to each sub-user from your total Gbps pool. For example, with a 10 Gbps pool, you could give 50 users 200 Mbps each.</p>
                </Step>
                <Step number="5" title="Manage credits">
                  <p>Distribute credits to your sub-users so they can create DNS proxies. You can add or remove credits at any time.</p>
                </Step>
              </div>
            </GuideSection>

            {/* Need Help */}
            <section className="glass rounded-2xl p-8 text-center">
              <h2 className="text-lg font-bold text-slate-100 mb-2">Still need help?</h2>
              <p className="text-sm text-slate-400 mb-6">If you have questions or run into issues, feel free to reach out to our support team.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/register" className="btn-primary text-sm px-6 py-2.5 inline-flex items-center justify-center gap-2">
                  Get Started <Zap className="w-3.5 h-3.5" />
                </Link>
                <Link to="/dashboard" className="btn-secondary text-sm px-6 py-2.5 inline-flex items-center justify-center gap-2">
                  Go to Dashboard
                </Link>
              </div>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
