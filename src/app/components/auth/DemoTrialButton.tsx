import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

interface DemoTrialButtonProps {
  loading?: boolean;
  onClick: () => void;
}

/** Secondary way in, below the form: one click opens a private demo sandbox. */
const DemoTrialButton: React.FC<DemoTrialButtonProps> = ({ loading = false, onClick }) => (
  <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-surface p-4">
    <div className="min-w-[180px] flex-1">
      <p className="text-sm font-medium text-text-primary">Just looking around?</p>
      <p className="text-[13px] leading-5 text-text-muted">Open a private sandbox with sample data. No signup.</p>
    </div>
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="btn btn-secondary shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      Try the demo
      {!loading && <ArrowRight aria-hidden className="w-4 h-4" />}
    </button>
  </div>
);

export default DemoTrialButton;
