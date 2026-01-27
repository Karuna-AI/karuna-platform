import React from 'react';

interface AdherenceData {
  taken: number;
  missed: number;
  skipped: number;
  pending: number;
  rate: number;
}

interface AdherenceCardProps {
  data: AdherenceData;
  onViewDetails?: () => void;
}

export const AdherenceCard: React.FC<AdherenceCardProps> = ({ data, onViewDetails }) => {
  const getAdherenceColor = (rate: number): string => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAdherenceStatus = (rate: number): string => {
    if (rate >= 90) return 'Excellent';
    if (rate >= 70) return 'Good';
    if (rate >= 50) return 'Needs Attention';
    return 'Critical';
  };

  const getProgressColor = (rate: number): string => {
    if (rate >= 90) return 'bg-green-500';
    if (rate >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const totalDoses = data.taken + data.missed + data.skipped + data.pending;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          <span className="mr-2">💊</span>
          Medication Adherence
        </h3>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View Details →
          </button>
        )}
      </div>

      {totalDoses === 0 ? (
        <div className="text-center py-4 text-gray-500">
          <p>No medications scheduled for today</p>
        </div>
      ) : (
        <>
          {/* Main adherence rate */}
          <div className="text-center mb-4">
            <div className={`text-4xl font-bold ${getAdherenceColor(data.rate)}`}>
              {data.rate}%
            </div>
            <div className="text-sm text-gray-500">
              {getAdherenceStatus(data.rate)}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
            <div
              className={`h-3 rounded-full ${getProgressColor(data.rate)} transition-all duration-500`}
              style={{ width: `${data.rate}%` }}
            />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-green-50 rounded p-2">
              <div className="text-xl font-bold text-green-600">{data.taken}</div>
              <div className="text-xs text-green-700">Taken</div>
            </div>
            <div className="bg-red-50 rounded p-2">
              <div className="text-xl font-bold text-red-600">{data.missed}</div>
              <div className="text-xs text-red-700">Missed</div>
            </div>
            <div className="bg-yellow-50 rounded p-2">
              <div className="text-xl font-bold text-yellow-600">{data.skipped}</div>
              <div className="text-xs text-yellow-700">Skipped</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xl font-bold text-gray-600">{data.pending}</div>
              <div className="text-xs text-gray-700">Pending</div>
            </div>
          </div>

          {/* Warning for missed doses */}
          {data.missed > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-red-500">⚠️</span>
                <span className="text-sm text-red-700">
                  {data.missed} medication{data.missed > 1 ? 's' : ''} missed today
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdherenceCard;
