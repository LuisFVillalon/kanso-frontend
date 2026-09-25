'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  /** Password fields only: adds a show/hide toggle inside the field. */
  revealable?: boolean;
}

const AuthInput: React.FC<AuthInputProps> = ({ label, id, revealable = false, type, ...inputProps }) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={revealable && revealed ? 'text' : type}
          {...inputProps}
          className={`input-field min-h-11 text-sm placeholder:text-text-muted ${revealable ? 'pr-11' : ''}`}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-text-muted transition-colors hover:text-text-primary"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default AuthInput;
