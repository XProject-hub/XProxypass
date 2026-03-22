export default function GlassCard({ children, className = '', hover = true }) {
  return (
    <div className={`glass rounded-2xl p-6 ${hover ? 'glass-hover' : ''} ${className}`}>
      {children}
    </div>
  );
}
