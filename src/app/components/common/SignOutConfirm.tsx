'use client';

/**
 * "Are you sure?" before signing out, shared by the account menu and Settings.
 * Neutral, not danger red: signing out deletes nothing.
 */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/app/components/common/Modal';

interface Props {
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

const SignOutConfirm: React.FC<Props> = ({ onCancel, onConfirm }) => {
  const [signingOut, setSigningOut] = useState(false);

  const handleConfirm = async () => {
    setSigningOut(true);
    try {
      await onConfirm();
    } finally {
      setSigningOut(false);
      onCancel();
    }
  };

  return (
    <Modal onClose={onCancel} layer="top" panelClassName="modal-panel max-w-sm w-full p-6">
      <div role="alertdialog" aria-modal="true" aria-labelledby="sign-out-title" aria-describedby="sign-out-detail" className="space-y-4">
        <div className="text-center space-y-1">
          <p id="sign-out-title" className="text-text-primary">Are you sure you want to sign out?</p>
          <p id="sign-out-detail" className="text-sm text-text-muted">Nothing is deleted. You can sign back in any time.</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={signingOut}
            autoFocus
            className="btn btn-secondary flex-1 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={signingOut}
            className="btn btn-primary flex-1 py-2 disabled:cursor-wait"
          >
            {signingOut && <Loader2 className="w-4 h-4 animate-spin" />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SignOutConfirm;
