import React from 'react';
import type { ActivityLog } from '../../types';

interface ActivityMonitorProps {
  lastActivity: ActivityLog | null;
  inactivityMinutes: number | null;
  inactivityStatus: string;
  checkinResponseRate?: number;
  thresholds?: { concerningMinutes: number; alertMinutes: number };
}

const statusConfig: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  active: {
    color: 'text-green-600',
    bg: 'bg-green-100',
    icon: '🟢',
    label: 'Active Now',
  },
  normal: {
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    icon: '🔵',
    label: 'Normal',
  },
  concerning: {
    color: 'text-yellow-600',
    bg: 'bg-yellow-100',
    icon: '🟡',
    label: 'Concerning',
  },
  alert: {
    color: 'text-red-600',
    bg: 'bg-red-100',
    icon: '🔴',
    label: 'Alert',
  },
  unknown: {
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    icon: '⚪',
    label: 'Unknown',
  },
};

const formatInactivity = (minutes: number | null): string => {
  if (minutes === null) return 'Unknown';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const activityTypeLabels: Record<string, string> = {
  app_open: 'Opened app',
  voice_interaction: 'Voice chat',
  check_in_response: 'Check-in response',
  medication_taken: 'Took medication',
  vault_access: 'Accessed vault',
  settings_change: 'Changed settings',
};

const DEFAULT_THRESHOLDS = { concerningMinutes: 240, alertMinutes: 480 };

export const ActivityMonitor: React.FC<ActivityMonitorProps> = ({
  lastActivity,
  inactivityMinutes,
  inactivityStatus,
  checkinResponseRate,
  thresholds = DEFAULT_THRESHOLDS,
}) => {
  const status = statusConfig[inactivityStatus] || statusConfig.unknown;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        <span className="mr-2">📱</span>
        Activity Monitor
      </h3>

      {/* Status indicator */}
      <div className={`${status.bg} rounded-lg p-4 mb-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{status.icon}</span>
            <div>
              <div className={`font-semibold ${status.color}`}>
                {status.label}
              </div>
              <div className="text-sm text-gray-600">
                Last active: {formatInactivity(inactivityMinutes)}
              </div>
            </div>
          </div>
          {inactivityStatus === 'alert' && (
            <div className="text-red-500 animate-pulse">
              ⚠️ Needs Attention
            </div>
          )}
        </div>
      </div>

      {/* Last activity details */}
      {lastActivity && (
        <div className="border-t pt-4">
          <div className="text-sm text-gray-500 mb-2">Last Activity</div>
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {lastActivity.activityType === 'voice_interaction' ? '🗣️' :
               lastActivity.activityType === 'medication_taken' ? '💊' :
               lastActivity.activityType === 'check_in_response' ? '✅' : '📱'}
            </span>
            <div>
              <div className="font-medium text-gray-800">
                {activityTypeLabels[lastActivity.activityType] || lastActivity.activityType}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(lastActivity.recordedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Check-in response rate */}
      {checkinResponseRate !== undefined && (
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Check-in Response Rate</div>
            <div className={`font-semibold ${
              checkinResponseRate >= 80 ? 'text-green-600' :
              checkinResponseRate >= 50 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {checkinResponseRate}%
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                checkinResponseRate >= 80 ? 'bg-green-500' :
                checkinResponseRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${checkinResponseRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Inactivity warning */}
      {(inactivityStatus === 'concerning' || inactivityStatus === 'alert') && (
        <div className={`mt-4 p-3 rounded-lg ${
          inactivityStatus === 'alert' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            <span>{inactivityStatus === 'alert' ? '🚨' : '⚠️'}</span>
            <span className={`text-sm ${inactivityStatus === 'alert' ? 'text-red-700' : 'text-yellow-700'}`}>
              {inactivityStatus === 'alert'
                ? `No activity for over ${thresholds.alertMinutes >= 60 ? `${Math.floor(thresholds.alertMinutes / 60)} hour${Math.floor(thresholds.alertMinutes / 60) !== 1 ? 's' : ''}` : `${thresholds.alertMinutes} minutes`}. Consider checking in.`
                : `No activity for over ${thresholds.concerningMinutes >= 60 ? `${Math.floor(thresholds.concerningMinutes / 60)} hour${Math.floor(thresholds.concerningMinutes / 60) !== 1 ? 's' : ''}` : `${thresholds.concerningMinutes} minutes`}. Extended period of inactivity detected.`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityMonitor;
