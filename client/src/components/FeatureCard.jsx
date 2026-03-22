import GlassCard from './GlassCard';

export default function FeatureCard({ icon: Icon, title, description }) {
  return (
    <GlassCard className="group">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/10 flex items-center justify-center mb-5 group-hover:border-cyan-500/20 transition-colors">
        <Icon className="w-5 h-5 text-cyan-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </GlassCard>
  );
}
