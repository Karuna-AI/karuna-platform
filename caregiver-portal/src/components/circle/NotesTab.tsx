import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import type { SyncData, VaultNote } from '../../types';
import { formatDate } from './utils';

interface NotesTabProps {
  circleId: string;
  vaultData: SyncData | null;
  setVaultData: React.Dispatch<React.SetStateAction<SyncData | null>>;
  canAddNotes: boolean | undefined;
}

export function NotesTab({ circleId, vaultData, setVaultData, canAddNotes }: NotesTabProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Note modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<VaultNote['category']>('general');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  // Note edit state
  const [editingNote, setEditingNote] = useState<VaultNote | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');
  const [editNoteCategory, setEditNoteCategory] = useState<VaultNote['category']>('general');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNoteError, setEditNoteError] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoteError('');
    setIsAddingNote(true);

    const result = await api.addNote(circleId, {
      title: noteTitle,
      content: noteContent,
      category: noteCategory,
    });

    setIsAddingNote(false);

    if (result.success && result.data) {
      if (vaultData) {
        setVaultData({
          ...vaultData,
          notes: [...vaultData.notes, result.data],
        });
      }
      setShowNoteModal(false);
      setNoteTitle('');
      setNoteContent('');
      setNoteCategory('general');
      setNoteError('');
      showToast('Note added', 'success');
    } else {
      setNoteError(result.error || 'Failed to add note');
    }
  };

  const handleEditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;
    setEditNoteError('');
    setIsEditingNote(true);
    const result = await api.updateNote(circleId, editingNote.id, {
      title: editNoteTitle,
      content: editNoteContent,
      category: editNoteCategory,
    });
    setIsEditingNote(false);
    if (result.success && result.data) {
      if (vaultData) {
        setVaultData({
          ...vaultData,
          notes: vaultData.notes.map((n) => n.id === editingNote.id ? result.data! : n),
        });
      }
      setEditingNote(null);
    } else {
      setEditNoteError(result.error || 'Failed to update note');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeletingNoteId(noteId);
    const result = await api.deleteNote(circleId, noteId);
    setDeletingNoteId(null);
    if (result.success && vaultData) {
      setVaultData({
        ...vaultData,
        notes: vaultData.notes.filter((n) => n.id !== noteId),
      });
    } else if (!result.success) {
      showToast(result.error || 'Failed to delete note', 'error');
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Care Notes</h2>
          {canAddNotes && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowNoteModal(true)}>
              + Add Note
            </button>
          )}
        </div>

        {!vaultData?.notes.length ? (
          <div className="empty-state">
            <p className="text-muted">No notes yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {vaultData.notes
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((note) => (
                <div
                  key={note.id}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${
                      note.category === 'medical'
                        ? 'var(--error)'
                        : note.category === 'financial'
                        ? 'var(--warning)'
                        : 'var(--primary)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <h4>{note.title}</h4>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)' }}>
                        {note.category}
                      </span>
                      {(canAddNotes && note.authorId === user?.id) && (
                        <>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setEditingNote(note);
                              setEditNoteTitle(note.title);
                              setEditNoteContent(note.content);
                              setEditNoteCategory(note.category);
                              setEditNoteError('');
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteNote(note.id)}
                            disabled={deletingNoteId === note.id}
                          >
                            {deletingNoteId === note.id ? '...' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p style={{ marginBottom: '0.5rem' }}>{note.content}</p>
                  <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                    By {note.authorName} on {formatDate(note.createdAt)}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Note Modal */}
      {showNoteModal && (
        <div className="modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Note</h2>
              <button className="modal-close" onClick={() => setShowNoteModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleAddNote}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  required
                  disabled={isAddingNote}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as VaultNote['category'])}
                  disabled={isAddingNote}
                >
                  <option value="general">General</option>
                  <option value="medical">Medical</option>
                  <option value="financial">Financial</option>
                  <option value="personal">Personal</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Content</label>
                <textarea
                  className="form-input"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your note..."
                  rows={4}
                  required
                  disabled={isAddingNote}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {noteError && (
                <div className="alert alert-error" style={{ margin: '0 0 1rem' }}>{noteError}</div>
              )}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowNoteModal(false); setNoteError(''); }}
                  disabled={isAddingNote}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isAddingNote}>
                  {isAddingNote ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="modal-overlay" onClick={() => setEditingNote(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Note</h2>
              <button className="modal-close" onClick={() => setEditingNote(null)}>×</button>
            </div>
            <form onSubmit={handleEditNote}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={editNoteTitle}
                  onChange={(e) => setEditNoteTitle(e.target.value)}
                  required
                  disabled={isEditingNote}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={editNoteCategory}
                  onChange={(e) => setEditNoteCategory(e.target.value as VaultNote['category'])}
                  disabled={isEditingNote}
                >
                  <option value="general">General</option>
                  <option value="medical">Medical</option>
                  <option value="financial">Financial</option>
                  <option value="personal">Personal</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Content</label>
                <textarea
                  className="form-input"
                  value={editNoteContent}
                  onChange={(e) => setEditNoteContent(e.target.value)}
                  rows={4}
                  required
                  disabled={isEditingNote}
                  style={{ resize: 'vertical' }}
                />
              </div>
              {editNoteError && (
                <div className="alert alert-error" style={{ margin: '0 0 1rem' }}>{editNoteError}</div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingNote(null)} disabled={isEditingNote}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isEditingNote}>
                  {isEditingNote ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
