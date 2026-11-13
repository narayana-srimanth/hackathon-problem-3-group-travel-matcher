import { useState } from 'react';
import { useCreateJoinRequest } from '../api/hooks';
import { ErrorBox, Modal } from './ui';
import { useToast } from './Toasts';

/** E15: send an "Interested" request. The server re-checks all 6 rules. */
export function JoinRequestModal({ groupId, groupName, ownerName, searchId, onClose }: {
  groupId: string; groupName: string; ownerName: string; searchId: string; onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const join = useCreateJoinRequest(groupId);
  const toast = useToast();

  return (
    <Modal title={`Ask to join ${groupName}`} onClose={onClose}>
      <p className="muted">{ownerName.split(' ')[0]} will see your profile and this note, then approve or decline.</p>
      <label className="field">
        Message to {ownerName.split(' ')[0]} (optional)
        <textarea className="input" rows={4} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder={`Hi ${ownerName.split(' ')[0]}! I'd love to join.`} />
        <span className="hint">{message.length}/500</span>
      </label>
      {join.isError && <ErrorBox error={join.error} />}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn ocean" disabled={join.isPending}
          onClick={() => join.mutate(
            { searchId, ...(message.trim() ? { message: message.trim() } : {}) },
            { onSuccess: () => { toast(`Request sent to ${ownerName.split(' ')[0]}`); onClose(); } },
          )}>
          {join.isPending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </Modal>
  );
}
