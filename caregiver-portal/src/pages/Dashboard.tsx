import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import type { CareCircle } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [circles, setCircles] = useState<CareCircle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [elderlyName, setElderlyName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadCircles();
  }, []);

  const loadCircles = async () => {
    const result = await api.getCareCircles();
    if (result.success && result.data) {
      setCircles(result.data);
    }
    setIsLoading(false);
  };

  const handleCreateCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    const result = await api.createCareCircle({
      name: newCircleName,
      elderlyName,
    });

    if (result.success && result.data) {
      setCircles([...circles, result.data]);
      setShowCreateModal(false);
      setNewCircleName('');
      setElderlyName('');
    } else {
      setCreateError(result.error || 'Failed to create care circle');
    }

    setIsCreating(false);
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Welcome, {user?.name}</h1>
          <p className="text-muted">Manage your care circles</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + New Care Circle
        </button>
      </div>

      {circles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👨‍👩‍👧‍👦</div>
            <h3 className="empty-state-title">No Care Circles Yet</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              Create a care circle to start collaborating with family members
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              Create Your First Care Circle
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          {circles.map((circle) => (
            <Link
              key={circle.id}
              to={`/circles/${circle.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="card" style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}>
                <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  {circle.name}
                </h3>
                <p className="text-muted" style={{ marginBottom: '1rem' }}>
                  Caring for {circle.elderlyName}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                    Created {new Date(circle.createdAt).toLocaleDateString()}
                  </span>
                  <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                    View Details →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Care Circle</h2>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            {createError && (
              <div className="alert alert-error">{createError}</div>
            )}

            <form onSubmit={handleCreateCircle}>
              <div className="form-group">
                <label className="form-label" htmlFor="circleName">Circle Name</label>
                <input
                  id="circleName"
                  type="text"
                  className="form-input"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  placeholder="e.g., Mom's Care Team"
                  required
                  disabled={isCreating}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="elderlyName">Who are you caring for?</label>
                <input
                  id="elderlyName"
                  type="text"
                  className="form-input"
                  value={elderlyName}
                  onChange={(e) => setElderlyName(e.target.value)}
                  placeholder="e.g., Mom, Grandmother, etc."
                  required
                  disabled={isCreating}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create Circle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
