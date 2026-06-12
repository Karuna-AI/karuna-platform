import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import type { CareCircleMember, CareCircleRole } from '../../types';
import { formatDate } from './utils';

interface MembersTabProps {
  circleId: string;
  members: CareCircleMember[];
  setMembers: React.Dispatch<React.SetStateAction<CareCircleMember[]>>;
  currentMember: CareCircleMember | undefined;
}

export function MembersTab({ circleId, members, setMembers, currentMember }: MembersTabProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CareCircleRole>('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Member action state
  const [removeError, setRemoveError] = useState('');
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const canInvite = currentMember?.permissions.canInviteMembers;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setIsInviting(true);

    const result = await api.inviteMember(circleId, {
      email: inviteEmail,
      role: inviteRole,
    });

    if (result.success) {
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      showToast(`Invitation sent to ${inviteEmail}`, 'success');
      setInviteEmail('');
      setInviteRole('viewer');
    } else {
      setInviteError(result.error || 'Failed to send invitation');
    }

    setIsInviting(false);
  };

  const handleChangeRole = async (memberId: string, newRole: CareCircleRole) => {
    setChangingRoleId(memberId);
    const result = await api.updateMemberRole(circleId, memberId, newRole);
    setChangingRoleId(null);
    if (result.success) {
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
    } else {
      showToast(result.error || 'Failed to update member role', 'error');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    setRemoveError('');
    setIsRemovingId(memberId);
    const result = await api.removeMember(circleId, memberId);
    setIsRemovingId(null);
    if (result.success) {
      setMembers(members.filter((m) => m.id !== memberId));
    } else {
      setRemoveError(result.error || 'Failed to remove member');
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Members</h2>
          {canInvite && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowInviteModal(true)}>
              + Invite Member
            </button>
          )}
        </div>

        {removeError && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{removeError}</div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>{member.name}</td>
                <td>{member.email}</td>
                <td>
                  {currentMember?.permissions.canRemoveMembers &&
                    member.userId !== user?.id &&
                    member.role !== 'owner' ? (
                      <select
                        className="form-select"
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value as CareCircleRole)}
                        disabled={changingRoleId === member.id}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      >
                        <option value="viewer">viewer</option>
                        <option value="caregiver">caregiver</option>
                      </select>
                  ) : (
                    <span className={`badge badge-${member.role}`}>{member.role}</span>
                  )}
                </td>
                <td>{formatDate(member.joinedAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  {currentMember?.permissions.canRemoveMembers &&
                    member.userId !== user?.id &&
                    member.role !== 'owner' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={isRemovingId === member.id}
                      >
                        {isRemovingId === member.id ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Invite Member</h2>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>
                ×
              </button>
            </div>

            {inviteError && <div className="alert alert-error">{inviteError}</div>}
            {inviteSuccess && <div className="alert alert-success">{inviteSuccess}</div>}

            <form onSubmit={handleInvite}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter email address"
                  required
                  disabled={isInviting}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CareCircleRole)}
                  disabled={isInviting}
                >
                  <option value="viewer">Viewer - Can view basic info</option>
                  <option value="caregiver">Caregiver - Can view and edit data</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowInviteModal(false)}
                  disabled={isInviting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isInviting}>
                  {isInviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
