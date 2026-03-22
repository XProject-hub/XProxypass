import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export default function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-medium text-slate-200 pr-4">{question}</span>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center">
          {open
            ? <Minus className="w-4 h-4 text-cyan-400" />
            : <Plus className="w-4 h-4 text-slate-400" />
          }
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-5 pb-5 text-sm text-slate-400 leading-relaxed border-t border-white/[0.04] pt-4">
          {answer}
        </div>
      </div>
    </div>
  );
}
