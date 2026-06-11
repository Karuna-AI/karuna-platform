import type { SyncData } from '../../types';
import { formatDate } from './utils';

interface VaultTabProps {
  vaultData: SyncData | null;
  isVaultLoading: boolean;
  canViewVault: boolean | undefined;
  canViewSensitive: boolean | undefined;
}

export function VaultTab({ vaultData, isVaultLoading, canViewVault, canViewSensitive }: VaultTabProps) {
  const maskSensitive = (value: string | undefined) => {
    if (!value) return '-';
    if (canViewSensitive) return value;
    return '••••' + value.slice(-4);
  };

  return (
    <>
      {canViewVault && (
        <div>
          {isVaultLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" />
              <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading vault data…</p>
            </div>
          ) : vaultData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Medications */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Medications</h3>
            {vaultData.medications.length === 0 ? (
              <p className="text-muted">No medications recorded</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Dosage</th>
                    <th>Frequency</th>
                    <th>Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {vaultData.medications.map((med) => (
                    <tr key={med.id}>
                      <td><strong>{med.name}</strong></td>
                      <td>{med.dosage}</td>
                      <td>{med.frequency}</td>
                      <td>{med.timing.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Doctors */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Doctors</h3>
            {vaultData.doctors.length === 0 ? (
              <p className="text-muted">No doctors recorded</p>
            ) : (
              <div className="grid grid-2">
                {vaultData.doctors.map((doc) => (
                  <div key={doc.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <h4>{doc.name}</h4>
                    <p className="text-muted">{doc.specialty}</p>
                    {doc.hospital && <p>{doc.hospital}</p>}
                    {doc.phone && <p>Phone: {doc.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Appointments */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Upcoming Appointments</h3>
            {vaultData.appointments.filter((a) => a.status === 'scheduled').length === 0 ? (
              <p className="text-muted">No upcoming appointments</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Doctor</th>
                    <th>Purpose</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {vaultData.appointments
                    .filter((a) => a.status === 'scheduled')
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((apt) => (
                      <tr key={apt.id}>
                        <td>{formatDate(apt.date)}</td>
                        <td>{apt.time}</td>
                        <td>{apt.doctorName}</td>
                        <td>{apt.purpose}</td>
                        <td>{apt.location || '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Contacts */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Emergency Contacts</h3>
            {vaultData.contacts.filter((c) => c.isEmergency).length === 0 ? (
              <p className="text-muted">No emergency contacts recorded</p>
            ) : (
              <div className="grid grid-3">
                {vaultData.contacts
                  .filter((c) => c.isEmergency)
                  .map((contact) => (
                    <div key={contact.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      <h4>{contact.name}</h4>
                      <p className="text-muted">{contact.relationship}</p>
                      {contact.phone && <p>Phone: {contact.phone}</p>}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Accounts (only if can view sensitive) */}
          {canViewSensitive && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>Accounts</h3>
              {vaultData.accounts.length === 0 ? (
                <p className="text-muted">No accounts recorded</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Account Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaultData.accounts.map((account) => (
                      <tr key={account.id}>
                        <td><strong>{account.name}</strong></td>
                        <td>{account.type}</td>
                        <td>{maskSensitive(account.accountNumber)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
          ) : (
            <div className="card">
              <div className="empty-state">
                <p className="text-muted">No vault data available</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!canViewVault && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <h3 className="empty-state-title">Access Restricted</h3>
            <p className="text-muted">You don't have permission to view vault data</p>
          </div>
        </div>
      )}
    </>
  );
}
