import type { CareCircleMember, SyncData } from '../../types';

interface OverviewTabProps {
  members: CareCircleMember[];
  vaultData: SyncData | null;
}

export function OverviewTab({ members, vaultData }: OverviewTabProps) {
  return (
    <div className="grid grid-3">
      <div className="card">
        <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Members</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{members.length}</p>
        <p className="text-muted">Active caregivers</p>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Medications</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{vaultData?.medications.length || 0}</p>
        <p className="text-muted">Being tracked</p>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Appointments</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          {vaultData?.appointments.filter((a) => a.status === 'scheduled').length || 0}
        </p>
        <p className="text-muted">Upcoming</p>
      </div>
    </div>
  );
}
