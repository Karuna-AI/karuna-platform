import React from 'react';
import type { HealthReading } from '../../types';

interface HealthCardProps {
  readings: HealthReading[];
}

const healthTypeConfig: Record<string, { icon: string; label: string; unit: string; format: (v: Record<string, number>) => string }> = {
  heart_rate: {
    icon: '❤️',
    label: 'Heart Rate',
    unit: 'bpm',
    format: (v) => `${v.value || v.bpm || '-'}`,
  },
  blood_pressure: {
    icon: '🩸',
    label: 'Blood Pressure',
    unit: 'mmHg',
    format: (v) => `${v.systolic || '-'}/${v.diastolic || '-'}`,
  },
  steps: {
    icon: '🚶',
    label: 'Steps Today',
    unit: 'steps',
    format: (v) => `${(v.value || v.count || 0).toLocaleString()}`,
  },
  weight: {
    icon: '⚖️',
    label: 'Weight',
    unit: 'kg',
    format: (v) => `${v.value || '-'}`,
  },
  blood_glucose: {
    icon: '🍬',
    label: 'Blood Glucose',
    unit: 'mg/dL',
    format: (v) => `${v.value || '-'}`,
  },
  oxygen_saturation: {
    icon: '💨',
    label: 'Oxygen Saturation',
    unit: '%',
    format: (v) => `${v.value || '-'}`,
  },
  temperature: {
    icon: '🌡️',
    label: 'Temperature',
    unit: '°F',
    format: (v) => `${v.value || '-'}`,
  },
  sleep: {
    icon: '😴',
    label: 'Sleep Duration',
    unit: 'hrs',
    format: (v) => `${((v.duration || v.value || 0) / 60).toFixed(1)}`,
  },
};

const getTimeAgo = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const HealthCard: React.FC<HealthCardProps> = ({ readings }) => {
  if (readings.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Health Vitals</h3>
        <div className="text-center py-8 text-gray-500">
          <span className="text-4xl mb-2 block">📊</span>
          <p>No health data available</p>
          <p className="text-sm">Data will appear when synced from device</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Health Vitals</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {readings.map((reading) => {
          const config = healthTypeConfig[reading.dataType] || {
            icon: '📊',
            label: reading.dataType.replace(/_/g, ' '),
            unit: reading.unit || '',
            format: (v: Record<string, number>) => JSON.stringify(v),
          };

          const value = typeof reading.value === 'object' ? reading.value : { value: reading.value };

          return (
            <div
              key={reading.id}
              className="bg-gray-50 rounded-lg p-4 border border-gray-100"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{config.icon}</span>
                <span className="text-sm text-gray-600">{config.label}</span>
              </div>
              <div className="text-2xl font-bold text-gray-800">
                {config.format(value)}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  {config.unit}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {getTimeAgo(reading.measuredAt)}
                {reading.source && reading.source !== 'device' && (
                  <span className="ml-1">• {reading.source}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HealthCard;
