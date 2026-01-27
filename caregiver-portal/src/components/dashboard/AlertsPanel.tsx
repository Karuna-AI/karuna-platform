import React from 'react';
import type { CaregiverAlert } from '../../types';

interface AlertsPanelProps {
  alerts: CaregiverAlert[];
  onAcknowledge: (alertId: string) => void;
  onDismiss: (alertId: string) => void;
}

const severityColors = {
  critical: { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', icon: 'text-red-500' },
  high: { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-800', icon: 'text-orange-500' },
  medium: { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-800', icon: 'text-yellow-500' },
  low: { bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-800', icon: 'text-blue-500' },
};

const alertTypeIcons: Record<string, string> = {
  missed_medication: '💊',
  inactivity: '⏰',
  abnormal_vital: '❤️',
  low_adherence: '📉',
  missed_checkin: '📱',
};

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts, onAcknowledge, onDismiss }) => {
  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Alerts</h3>
        <div className="text-center py-8 text-gray-500">
          <span className="text-4xl mb-2 block">✓</span>
          <p>No active alerts</p>
          <p className="text-sm">Everything looks good!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Alerts ({alerts.length})
        </h3>
        <span className="text-sm text-gray-500">Active alerts require attention</span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const colors = severityColors[alert.severity];
          const icon = alertTypeIcons[alert.alertType] || '⚠️';

          return (
            <div
              key={alert.id}
              className={`${colors.bg} ${colors.border} border-l-4 rounded-r-lg p-4`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    <h4 className={`font-semibold ${colors.text}`}>{alert.title}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-gray-700 mt-1 text-sm">{alert.message}</p>
                  <p className="text-gray-500 text-xs mt-2">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-2 ml-4">
                  {alert.status === 'active' && (
                    <>
                      <button
                        onClick={() => onAcknowledge(alert.id)}
                        className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => onDismiss(alert.id)}
                        className="px-3 py-1 text-sm bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {alert.status === 'acknowledged' && (
                    <span className="text-sm text-gray-500">
                      Acknowledged by {alert.acknowledgedByName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AlertsPanel;
