interface SessionTimeoutModalProps {
  remainingSeconds: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export default function SessionTimeoutModal({
  remainingSeconds,
  onStayLoggedIn,
  onLogout,
}: SessionTimeoutModalProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        background: 'var(--bg-primary, #fff)',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏰</div>
        <h2 style={{ marginBottom: '0.5rem' }}>Session Expiring</h2>
        <p style={{ color: 'var(--text-muted, #666)', marginBottom: '1.5rem' }}>
          Your session will expire due to inactivity.
        </p>
        <div style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          color: remainingSeconds <= 30 ? 'var(--error, #e53e3e)' : 'var(--warning, #d69e2e)',
          marginBottom: '1.5rem',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={onLogout}
          >
            Logout
          </button>
          <button
            className="btn btn-primary"
            onClick={onStayLoggedIn}
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
