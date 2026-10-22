'use client';

/**
 * The confirm for Settings → Sign-in and security → Delete account: lists
 * what goes, requires the typed phrase, and focuses Cancel first so Enter
 * or a stray tap never deletes anything.
 */

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/app/components/common/Modal';

export const DELETE_PHRASE = 'delete my account';

interface Props {
  email: string | null;
  /** The OAuth provider's display name ("Google"), or null for email accounts. */
  providerLabel: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteAccountDialog: React.FC<Props> = ({ email, providerLabel, onCancel, onConfirm }) => {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <Modal
      onClose={() => { if (!deleting) onCancel(); }}
      layer="top"
      panelClassName="modal-panel max-w-md w-full p-6"
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-what" className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-1 shrink-0" style={{ color: 'var(--tm-danger)' }} />
          <h2 id="delete-account-title" className="text-xl text-text-primary">Delete your account?</h2>
        </div>

        <div id="delete-account-what" className="text-sm space-y-2" style={{ color: 'var(--tm-text-secondary)' }}>
          <p>This can&apos;t be undone. kanso permanently deletes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Every task, note, tag and habit</li>
            <li>Your mood check-ins, Term Tracker and doodle</li>
            <li>Your profile and settings</li>
            <li>Your kanso sign-in{email ? <> for <strong className="text-text-primary">{email}</strong></> : null}</li>
          </ul>
          {providerLabel && <p>Your {providerLabel} account itself is not affected.</p>}
        </div>

        <div>
          <label htmlFor="delete-account-phrase" className="block text-xs font-medium text-text-muted mb-1">
            Type <strong className="text-text-primary">{DELETE_PHRASE}</strong> to confirm
          </label>
          <input
            id="delete-account-phrase"
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={DELETE_PHRASE}
            autoComplete="off"
            className="input-field w-full text-sm"
          />
        </div>

        {error && <p role="alert" className="text-sm" style={{ color: 'var(--tm-danger)' }}>{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            autoFocus
            className="btn btn-outline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={typed !== DELETE_PHRASE || deleting}
            className="btn text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--tm-danger)' }}
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete my account
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteAccountDialog;
