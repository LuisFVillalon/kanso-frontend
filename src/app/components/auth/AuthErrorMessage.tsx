import React from 'react';
import { AlertCircle } from 'lucide-react';

/** Inline form error, announced to screen readers when it appears. */
const AuthErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <p role="alert" className="flex items-start gap-2 rounded-md px-3 py-2.5 text-sm bg-danger-subtle text-danger">
    <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{message}</span>
  </p>
);

export default AuthErrorMessage;
