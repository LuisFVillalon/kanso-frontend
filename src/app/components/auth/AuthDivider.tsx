import React from 'react';

const AuthDivider: React.FC = () => (
  <div className="flex items-center gap-3 my-6">
    <div className="flex-1 h-px bg-border" />
    <span className="text-xs text-text-muted">or use your email</span>
    <div className="flex-1 h-px bg-border" />
  </div>
);

export default AuthDivider;
