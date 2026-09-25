import React from 'react';
import { Loader2 } from 'lucide-react';
import GoogleLogo from '@/app/components/auth/GoogleLogo';

interface GoogleAuthButtonProps {
  label: string;
  loading?: boolean;
  onClick: () => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ label, loading = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="w-full min-h-11 flex items-center justify-center gap-3 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors bg-[#ffffff] hover:bg-[#f8f9fa] disabled:opacity-60 disabled:cursor-not-allowed"
    style={{
      borderColor: '#dadce0',
      color: '#3c4043',
      fontFamily: "'Roboto', sans-serif",
    }}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4285F4' }} /> : <GoogleLogo />}
    {label}
  </button>
);

export default GoogleAuthButton;
