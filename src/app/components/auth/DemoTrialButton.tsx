import React from 'react';
import { Loader2, NotebookText } from 'lucide-react';

interface DemoTrialButtonProps {
  loading?: boolean;
  onClick: () => void;
}

const DemoTrialButton: React.FC<DemoTrialButtonProps> = ({ loading = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="btn btn-secondary w-full flex items-center justify-center gap-2 py-2.5 mb-5 disabled:opacity-60 disabled:cursor-not-allowed"
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <NotebookText className="w-4 h-4" />}
    Try the demo — no signup required
  </button>
);

export default DemoTrialButton;
