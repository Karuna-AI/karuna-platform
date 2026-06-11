/**
 * Notes routes (add/update/delete care-circle notes).
 *
 * Extracted verbatim from server/careCircle.js. careCircle.js mounts this at
 * the original section position so Express route registration order is
 * unchanged.
 */

module.exports = function mountNoteRoutes(router, deps) {
const { db, authMiddleware, ROLE_PERMISSIONS } = deps;

// ============================================================================
// Notes Routes
// ============================================================================

// Add a note
router.post('/circles/:circleId/notes', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { title, content, category } = req.body;

    // Check membership
    const memberResult = await db.query(
      `SELECT cm.role, u.name
       FROM circle_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.circle_id = $1 AND cm.user_id = $2`,
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const { role, name } = memberResult.rows[0];
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions.canAddNotes) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await db.query(
      `INSERT INTO vault_notes (circle_id, author_id, author_name, author_role, title, content, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [circleId, req.user.id, name, role, title, content, category || 'general']
    );

    res.json({ success: true, note: result.rows[0] });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Update a note
router.put('/circles/:circleId/notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const { circleId, noteId } = req.params;
    const { title, content, category } = req.body;

    // Check if note exists and user can edit
    const noteResult = await db.query(
      'SELECT author_id FROM vault_notes WHERE id = $1 AND circle_id = $2',
      [noteId, circleId]
    );

    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only author or owner can edit
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const isAuthor = noteResult.rows[0].author_id === req.user.id;
    const isOwner = memberResult.rows[0].role === 'owner';

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Can only edit your own notes' });
    }

    const result = await db.query(
      `UPDATE vault_notes
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           category = COALESCE($3, category)
       WHERE id = $4
       RETURNING *`,
      [title, content, category, noteId]
    );

    res.json({ success: true, note: result.rows[0] });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note
router.delete('/circles/:circleId/notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const { circleId, noteId } = req.params;

    // Check if note exists and user can delete
    const noteResult = await db.query(
      'SELECT author_id FROM vault_notes WHERE id = $1 AND circle_id = $2',
      [noteId, circleId]
    );

    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only author or owner can delete
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const isAuthor = noteResult.rows[0].author_id === req.user.id;
    const isOwner = memberResult.rows[0].role === 'owner';

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Can only delete your own notes' });
    }

    await db.query('DELETE FROM vault_notes WHERE id = $1', [noteId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

};
