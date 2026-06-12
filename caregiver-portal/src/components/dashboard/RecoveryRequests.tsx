import React, { useCallback, useEffect, useState } from 'react';
import api, { type RecoveryRequest } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface RecoveryRequestsProps {
  circleId: string;
  /** Bumping this (e.g. on a recovery_request WebSocket event) re-fetches. */
  refreshSignal?: number;
}

/**
 * Vault PIN recovery approvals (H3). Shows pending requests from circle members
 * who forgot their vault PIN; an approver (owner/caregiver) approves so the
 * member's device can re-key. Renders nothing when there are no pending requests.
 */
export const RecoveryRequests: React.FC<RecoveryRequestsProps> = ({ circleId, refreshSignal }) => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.getRecoveryRequests(circleId);
    if (res.success && res.data) setRequests(res.data.requests || []);
  }, [circleId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handleApprove = async (userId: string, name: string) => {
    setApprovingId(userId);
    const res = await api.approveRecovery(circleId, userId);
    setApprovingId(null);
    if (res.success) {
      showToast(`Approved vault recovery for ${name}`, 'success');
      void load();
    } else {
      showToast(res.error || 'Failed to approve recovery', 'error');
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-500">
      <h3 className="text-lg font-semibold text-gray-800 mb-1">🔐 Vault Recovery Requests</h3>
      <p className="text-sm text-gray-500 mb-4">
        Approve only if you trust this request — it lets the person reset their vault PIN and
        regain access to their saved information.
      </p>
      <ul className="space-y-3">
        {requests.map((r) => (
          <li
            key={r.userId}
            className="flex items-center justify-between bg-amber-50 rounded-md p-3"
          >
            <div>
              <p className="font-medium text-gray-800">{r.name}</p>
              <p className="text-sm text-gray-500">
                {r.email}
                {r.requestedAt ? ` · requested ${new Date(r.requestedAt).toLocaleString()}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleApprove(r.userId, r.name)}
              disabled={approvingId === r.userId}
              className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
            >
              {approvingId === r.userId ? 'Approving…' : 'Approve'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RecoveryRequests;
