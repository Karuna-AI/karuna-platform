/**
 * Vault CRUD routes — medications, doctors, contacts, appointments, accounts,
 * documents (create/update/delete + document file download), plus the
 * requireVaultCapacity middleware factory.
 *
 * Extracted verbatim from server/careCircle.js. careCircle.js mounts this at
 * the original section position so Express route registration order is
 * unchanged.
 */

module.exports = function mountVaultCrudRoutes(router, deps) {
const {
  db,
  authMiddleware,
  requirePermission,
  checkVaultLimit,
  encryptField,
  decryptField,
  decryptAccount,
  stripDocumentFileData,
  ROLE_PERMISSIONS,
} = deps;

// ============================================================================
// Vault CRUD Routes
// ============================================================================

// Middleware factory: check vault item limit for a given table before create
function requireVaultCapacity(table) {
  return async (req, res, next) => {
    const { circleId } = req.params;
    const check = await checkVaultLimit(circleId, table);
    if (!check.allowed) {
      return res.status(402).json({
        error: `Vault limit reached for ${check.tier} tier (max ${check.limit} items). Upgrade to add more.`,
        code: 'VAULT_LIMIT_EXCEEDED',
        tier: check.tier,
        limit: check.limit,
      });
    }
    next();
  };
}

// --- Medications ---

// Create medication
router.post('/circles/:circleId/vault/medications', authMiddleware, requirePermission('canEditMedications'), requireVaultCapacity('vault_medications'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, dosage, frequency, timing, instructions, prescribingDoctor, pharmacy, refillDate, isActive } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Medication name is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_medications
       (circle_id, name, dosage, frequency, timing, instructions, prescribing_doctor, pharmacy, refill_date, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [circleId, name, dosage, frequency, timing || [], instructions, prescribingDoctor, pharmacy, refillDate, isActive !== false, req.member.name]
    );

    res.json({ success: true, medication: result.rows[0] });
  } catch (error) {
    console.error('Create medication error:', error);
    res.status(500).json({ error: 'Failed to create medication' });
  }
});

// Update medication
router.put('/circles/:circleId/vault/medications/:medicationId', authMiddleware, requirePermission('canEditMedications'), async (req, res) => {
  try {
    const { circleId, medicationId } = req.params;
    const { name, dosage, frequency, timing, instructions, prescribingDoctor, pharmacy, refillDate, isActive } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_medications WHERE id = $1 AND circle_id = $2',
      [medicationId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const result = await db.query(
      `UPDATE vault_medications
       SET name = COALESCE($1, name), dosage = COALESCE($2, dosage),
           frequency = COALESCE($3, frequency), timing = COALESCE($4, timing),
           instructions = COALESCE($5, instructions), prescribing_doctor = COALESCE($6, prescribing_doctor),
           pharmacy = COALESCE($7, pharmacy), refill_date = COALESCE($8, refill_date),
           is_active = COALESCE($9, is_active), updated_by = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND circle_id = $12
       RETURNING *`,
      [name, dosage, frequency, timing, instructions, prescribingDoctor, pharmacy, refillDate, isActive, req.member.name, medicationId, circleId]
    );

    res.json({ success: true, medication: result.rows[0] });
  } catch (error) {
    console.error('Update medication error:', error);
    res.status(500).json({ error: 'Failed to update medication' });
  }
});

// Delete medication
router.delete('/circles/:circleId/vault/medications/:medicationId', authMiddleware, requirePermission('canEditMedications'), async (req, res) => {
  try {
    const { circleId, medicationId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_medications WHERE id = $1 AND circle_id = $2 RETURNING id',
      [medicationId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete medication error:', error);
    res.status(500).json({ error: 'Failed to delete medication' });
  }
});

// --- Doctors ---

// Create doctor
router.post('/circles/:circleId/vault/doctors', authMiddleware, requirePermission('canEditDoctors'), requireVaultCapacity('vault_doctors'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, specialty, hospital, phone, email, address, notes, isPrimary } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Doctor name is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_doctors
       (circle_id, name, specialty, hospital, phone, email, address, notes, is_primary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [circleId, name, specialty, hospital, phone, email, address, notes, isPrimary || false, req.member.name]
    );

    res.json({ success: true, doctor: result.rows[0] });
  } catch (error) {
    console.error('Create doctor error:', error);
    res.status(500).json({ error: 'Failed to create doctor' });
  }
});

// Update doctor
router.put('/circles/:circleId/vault/doctors/:doctorId', authMiddleware, requirePermission('canEditDoctors'), async (req, res) => {
  try {
    const { circleId, doctorId } = req.params;
    const { name, specialty, hospital, phone, email, address, notes, isPrimary } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_doctors WHERE id = $1 AND circle_id = $2',
      [doctorId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const result = await db.query(
      `UPDATE vault_doctors
       SET name = COALESCE($1, name), specialty = COALESCE($2, specialty),
           hospital = COALESCE($3, hospital), phone = COALESCE($4, phone),
           email = COALESCE($5, email), address = COALESCE($6, address),
           notes = COALESCE($7, notes), is_primary = COALESCE($8, is_primary),
           updated_by = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND circle_id = $11
       RETURNING *`,
      [name, specialty, hospital, phone, email, address, notes, isPrimary, req.member.name, doctorId, circleId]
    );

    res.json({ success: true, doctor: result.rows[0] });
  } catch (error) {
    console.error('Update doctor error:', error);
    res.status(500).json({ error: 'Failed to update doctor' });
  }
});

// Delete doctor
router.delete('/circles/:circleId/vault/doctors/:doctorId', authMiddleware, requirePermission('canEditDoctors'), async (req, res) => {
  try {
    const { circleId, doctorId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_doctors WHERE id = $1 AND circle_id = $2 RETURNING id',
      [doctorId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete doctor error:', error);
    res.status(500).json({ error: 'Failed to delete doctor' });
  }
});

// --- Contacts ---

// Create contact
router.post('/circles/:circleId/vault/contacts', authMiddleware, requirePermission('canEditContacts'), requireVaultCapacity('vault_contacts'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, relationship, phone, email, address, isEmergency, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Contact name is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_contacts
       (circle_id, name, relationship, phone, email, address, is_emergency, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [circleId, name, relationship, phone, email, address, isEmergency || false, notes, req.member.name]
    );

    res.json({ success: true, contact: result.rows[0] });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
router.put('/circles/:circleId/vault/contacts/:contactId', authMiddleware, requirePermission('canEditContacts'), async (req, res) => {
  try {
    const { circleId, contactId } = req.params;
    const { name, relationship, phone, email, address, isEmergency, notes } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_contacts WHERE id = $1 AND circle_id = $2',
      [contactId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const result = await db.query(
      `UPDATE vault_contacts
       SET name = COALESCE($1, name), relationship = COALESCE($2, relationship),
           phone = COALESCE($3, phone), email = COALESCE($4, email),
           address = COALESCE($5, address), is_emergency = COALESCE($6, is_emergency),
           notes = COALESCE($7, notes), updated_by = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND circle_id = $10
       RETURNING *`,
      [name, relationship, phone, email, address, isEmergency, notes, req.member.name, contactId, circleId]
    );

    res.json({ success: true, contact: result.rows[0] });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
router.delete('/circles/:circleId/vault/contacts/:contactId', authMiddleware, requirePermission('canEditContacts'), async (req, res) => {
  try {
    const { circleId, contactId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_contacts WHERE id = $1 AND circle_id = $2 RETURNING id',
      [contactId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// --- Appointments ---

// Create appointment
router.post('/circles/:circleId/vault/appointments', authMiddleware, requirePermission('canEditAppointments'), requireVaultCapacity('vault_appointments'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { doctorId, doctorName, purpose, date, time, location, notes, reminder, status } = req.body;

    if (!purpose || !date) {
      return res.status(400).json({ error: 'Purpose and date are required' });
    }

    const result = await db.query(
      `INSERT INTO vault_appointments
       (circle_id, doctor_id, doctor_name, purpose, date, time, location, preparation_notes, reminder_sent, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [circleId, doctorId, doctorName, purpose, date, time, location, notes, reminder || false, status || 'scheduled', req.member.name]
    );

    res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment
router.put('/circles/:circleId/vault/appointments/:appointmentId', authMiddleware, requirePermission('canEditAppointments'), async (req, res) => {
  try {
    const { circleId, appointmentId } = req.params;
    const { doctorId, doctorName, purpose, date, time, location, notes, reminder, status } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_appointments WHERE id = $1 AND circle_id = $2',
      [appointmentId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const result = await db.query(
      `UPDATE vault_appointments
       SET doctor_id = COALESCE($1, doctor_id), doctor_name = COALESCE($2, doctor_name),
           purpose = COALESCE($3, purpose), date = COALESCE($4, date),
           time = COALESCE($5, time), location = COALESCE($6, location),
           preparation_notes = COALESCE($7, preparation_notes), reminder_sent = COALESCE($8, reminder_sent),
           status = COALESCE($9, status), updated_by = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND circle_id = $12
       RETURNING *`,
      [doctorId, doctorName, purpose, date, time, location, notes, reminder, status, req.member.name, appointmentId, circleId]
    );

    res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Delete appointment
router.delete('/circles/:circleId/vault/appointments/:appointmentId', authMiddleware, requirePermission('canEditAppointments'), async (req, res) => {
  try {
    const { circleId, appointmentId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_appointments WHERE id = $1 AND circle_id = $2 RETURNING id',
      [appointmentId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

// --- Accounts ---

// Create account
router.post('/circles/:circleId/vault/accounts', authMiddleware, requirePermission('canEditAccounts'), requireVaultCapacity('vault_accounts'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, type, institution, accountNumber, ifscCode, branch, nominee, notes } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const result = await db.query(
      `INSERT INTO vault_accounts
       (circle_id, name, type, institution, account_number_encrypted, ifsc_code, branch, nominee, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [circleId, name, type, institution, encryptField(accountNumber), ifscCode, branch, nominee, notes, req.member.name]
    );

    res.json({ success: true, account: decryptAccount(result.rows[0]) });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account
router.put('/circles/:circleId/vault/accounts/:accountId', authMiddleware, requirePermission('canEditAccounts'), async (req, res) => {
  try {
    const { circleId, accountId } = req.params;
    const { name, type, institution, accountNumber, ifscCode, branch, nominee, notes } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_accounts WHERE id = $1 AND circle_id = $2',
      [accountId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const result = await db.query(
      `UPDATE vault_accounts
       SET name = COALESCE($1, name), type = COALESCE($2, type),
           institution = COALESCE($3, institution), account_number_encrypted = COALESCE($4, account_number_encrypted),
           ifsc_code = COALESCE($5, ifsc_code), branch = COALESCE($6, branch),
           nominee = COALESCE($7, nominee), notes = COALESCE($8, notes),
           updated_by = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND circle_id = $11
       RETURNING *`,
      [name, type, institution, accountNumber !== undefined ? encryptField(accountNumber) : undefined, ifscCode, branch, nominee, notes, req.member.name, accountId, circleId]
    );

    res.json({ success: true, account: decryptAccount(result.rows[0]) });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/circles/:circleId/vault/accounts/:accountId', authMiddleware, requirePermission('canEditAccounts'), async (req, res) => {
  try {
    const { circleId, accountId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_accounts WHERE id = $1 AND circle_id = $2 RETURNING id',
      [accountId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// --- Documents ---

// Create document
router.post('/circles/:circleId/vault/documents', authMiddleware, requirePermission('canEditDocuments'), requireVaultCapacity('vault_documents'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { title, name, type, description, fileName, fileType, fileSize, fileData, expiryDate, isSensitive } = req.body;
    const docTitle = title || name;

    if (!docTitle) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    // fileData is base64-encoded file content from the client
    const encryptedFileData = fileData ? encryptField(fileData) : null;

    const result = await db.query(
      `INSERT INTO vault_documents
       (circle_id, title, type, description, file_name, file_type, file_size, file_data_encrypted, expiry_date, is_sensitive, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [circleId, docTitle, type || 'other', description, fileName, fileType, fileSize, encryptedFileData, expiryDate, isSensitive || false, req.member.name]
    );

    res.json({ success: true, document: stripDocumentFileData(result.rows[0]) });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Update document
router.put('/circles/:circleId/vault/documents/:documentId', authMiddleware, requirePermission('canEditDocuments'), async (req, res) => {
  try {
    const { circleId, documentId } = req.params;
    const { title, name, type, description, fileName, fileType, fileSize, fileData, expiryDate, isSensitive } = req.body;
    const docTitle = title || name;

    const existing = await db.query(
      'SELECT id FROM vault_documents WHERE id = $1 AND circle_id = $2',
      [documentId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const encryptedFileData = fileData !== undefined ? encryptField(fileData) : undefined;

    const result = await db.query(
      `UPDATE vault_documents
       SET title = COALESCE($1, title), type = COALESCE($2, type),
           description = COALESCE($3, description), file_name = COALESCE($4, file_name),
           file_type = COALESCE($5, file_type), file_size = COALESCE($6, file_size),
           file_data_encrypted = COALESCE($7, file_data_encrypted),
           expiry_date = COALESCE($8, expiry_date), is_sensitive = COALESCE($9, is_sensitive),
           updated_by = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND circle_id = $12
       RETURNING *`,
      [docTitle, type, description, fileName, fileType, fileSize, encryptedFileData, expiryDate, isSensitive, req.member.name, documentId, circleId]
    );

    res.json({ success: true, document: stripDocumentFileData(result.rows[0]) });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Download document file (decrypts file_data_encrypted and returns it)
router.get('/circles/:circleId/vault/documents/:documentId/file', authMiddleware, requirePermission('canViewDocuments'), async (req, res) => {
  try {
    const { circleId, documentId } = req.params;

    const result = await db.query(
      'SELECT title, file_name, file_type, file_data_encrypted, is_sensitive FROM vault_documents WHERE id = $1 AND circle_id = $2',
      [documentId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Sensitive documents require canViewSensitive permission
    if (doc.is_sensitive) {
      const memberResult = await db.query(
        'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
        [circleId, req.user.id]
      );
      const permissions = memberResult.rows.length > 0 ? ROLE_PERMISSIONS[memberResult.rows[0].role] : {};
      if (!permissions.canViewSensitive) {
        return res.status(403).json({ error: 'Permission denied: sensitive document' });
      }
    }

    if (!doc.file_data_encrypted) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }

    const decryptedData = decryptField(doc.file_data_encrypted);
    res.json({ success: true, fileData: decryptedData, fileName: doc.file_name, fileType: doc.file_type });
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Delete document
router.delete('/circles/:circleId/vault/documents/:documentId', authMiddleware, requirePermission('canEditDocuments'), async (req, res) => {
  try {
    const { circleId, documentId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_documents WHERE id = $1 AND circle_id = $2 RETURNING id',
      [documentId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

};
