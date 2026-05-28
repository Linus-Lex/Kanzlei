const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { extractTextFromFile } = require('../services/ocr');
const { extractFromText } = require('../services/aiExtraction');
const { toCSV, toJSON, toXML } = require('../services/raExport');

const router = express.Router();

// Multer Konfiguration
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Nur PDF und Bilddateien (JPG, PNG, TIFF, WEBP) erlaubt.'));
  },
});

// POST /api/cases/upload
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen.' });

  let caseId = null;
  try {
    // Fall initial anlegen
    const initial = await pool.query(
      `INSERT INTO cases (status, source, original_filename, file_path, created_by)
       VALUES ('verarbeitung', 'upload', $1, $2, $3) RETURNING id`,
      [req.file.originalname, req.file.path, req.user.id]
    );
    caseId = initial.rows[0].id;

    // OCR / Text-Extraktion
    const rawText = await extractTextFromFile(req.file.path, req.file.mimetype);

    // KI-Extraktion
    const { data, missingFields, fieldConfidence, overallConfidence } = await extractFromText(rawText);

    // Status bestimmen
    const status = missingFields.length === 0 ? 'bereit' : 'unvollstaendig';

    // Fall aktualisieren
    await pool.query(
      `UPDATE cases SET
        status = $1, raw_text = $2, ai_confidence = $3,
        missing_fields = $4, field_confidence = $5,
        unfall_datum = $6, unfall_uhrzeit = $7, unfall_strasse = $8,
        unfall_ort = $9, unfall_land = $10,
        mandant_name = $11, mandant_strasse = $12, mandant_plz = $13,
        mandant_ort = $14, mandant_telefon = $15, mandant_mobil = $16,
        mandant_email = $17, mandant_vorsteuerabzug = $18, mandant_war_fahrer = $19,
        fahrer_name = $20, fahrer_adresse = $21,
        bank_iban = $22, bank_inhaber = $23, bank_name = $24, bank_bic = $25,
        kfz_versicherung_name = $26, kfz_versicherung_nr = $27,
        teilkasko = $28, teilkasko_sb = $29, vollkasko = $30, vollkasko_sb = $31,
        fahrzeug_typ = $32, fahrzeug_kennzeichen = $33, fahrzeug_abgeschleppt = $34,
        fahrzeug_fahrbereit = $35, fahrzeug_scheckheft = $36, fahrzeug_vorschaeden = $37,
        fahrzeug_leasing = $38, fahrzeug_leasing_wo = $39, fahrzeug_leasing_nr = $40,
        fahrzeug_finanzierung = $41, fahrzeug_finanzierung_wo = $42, fahrzeug_finanzierung_nr = $43,
        rsv_name = $44, rsv_nr = $45, rsv_selbstbeteiligung = $46, rsv_sb_hoehe = $47,
        mietwagen_genommen = $48, mietwagen_von = $49, mietwagen_bis = $50, mietwagen_bei = $51,
        gegner_name = $52, gegner_strasse = $53, gegner_plz = $54, gegner_ort = $55,
        gegner_fahrzeug = $56, gegner_kennzeichen = $57,
        gegner_versicherung = $58, gegner_versicherung_nr = $59, gegner_schaden_nr = $60,
        unfall_schilderung = $61, zeugen = $62,
        personenschaeden = $63, geschaedigter_name = $64, behandelnder_arzt = $65, arzt_adresse = $66,
        polizei_aufgenommen = $67, polizei_aktenzeichen = $68, polizei_dienststelle = $69,
        gutachten_beauftragt = $70, gutachter_name = $71, gutachter_adresse = $72,
        updated_at = NOW()
       WHERE id = $73`,
      [
        status, rawText, overallConfidence,
        JSON.stringify(missingFields), JSON.stringify(fieldConfidence),
        data.unfall_datum, data.unfall_uhrzeit, data.unfall_strasse,
        data.unfall_ort, data.unfall_land,
        data.mandant_name, data.mandant_strasse, data.mandant_plz,
        data.mandant_ort, data.mandant_telefon, data.mandant_mobil,
        data.mandant_email, data.mandant_vorsteuerabzug, data.mandant_war_fahrer,
        data.fahrer_name, data.fahrer_adresse,
        data.bank_iban, data.bank_inhaber, data.bank_name, data.bank_bic,
        data.kfz_versicherung_name, data.kfz_versicherung_nr,
        data.teilkasko, data.teilkasko_sb, data.vollkasko, data.vollkasko_sb,
        data.fahrzeug_typ, data.fahrzeug_kennzeichen, data.fahrzeug_abgeschleppt,
        data.fahrzeug_fahrbereit, data.fahrzeug_scheckheft, data.fahrzeug_vorschaeden,
        data.fahrzeug_leasing, data.fahrzeug_leasing_wo, data.fahrzeug_leasing_nr,
        data.fahrzeug_finanzierung, data.fahrzeug_finanzierung_wo, data.fahrzeug_finanzierung_nr,
        data.rsv_name, data.rsv_nr, data.rsv_selbstbeteiligung, data.rsv_sb_hoehe,
        data.mietwagen_genommen, data.mietwagen_von, data.mietwagen_bis, data.mietwagen_bei,
        data.gegner_name, data.gegner_strasse, data.gegner_plz, data.gegner_ort,
        data.gegner_fahrzeug, data.gegner_kennzeichen,
        data.gegner_versicherung, data.gegner_versicherung_nr, data.gegner_schaden_nr,
        data.unfall_schilderung, data.zeugen,
        data.personenschaeden, data.geschaedigter_name, data.behandelnder_arzt, data.arzt_adresse,
        data.polizei_aufgenommen, data.polizei_aktenzeichen, data.polizei_dienststelle,
        data.gutachten_beauftragt, data.gutachter_name, data.gutachter_adresse,
        caseId
      ]
    );

    await auditLog({ caseId, userId: req.user.id, action: 'upload_processed', ipAddress: req.ip });

    const caseResult = await pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);
    res.status(201).json({ case: caseResult.rows[0] });

  } catch (err) {
    console.error('Upload-Fehler:', err);
    if (caseId) {
      await pool.query("UPDATE cases SET status = 'fehler', updated_at = NOW() WHERE id = $1", [caseId]);
    }
    res.status(500).json({ error: 'Fehler bei der Verarbeitung: ' + err.message });
  }
});

// GET /api/cases
router.get('/', auth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const values = [];
    let i = 1;

    if (status) { conditions.push(`status = $${i++}`); values.push(status); }
    if (search) {
      conditions.push(`(mandant_name ILIKE $${i} OR fahrzeug_kennzeichen ILIKE $${i} OR gegner_kennzeichen ILIKE $${i})`);
      values.push(`%${search}%`); i++;
    }

    const where = conditions.join(' AND ');
    const countRes = await pool.query(`SELECT COUNT(*) FROM cases WHERE ${where}`, values);
    const total = parseInt(countRes.rows[0].count);

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT id, status, source, original_filename, mandant_name, fahrzeug_kennzeichen,
              unfall_datum, unfall_ort, ai_confidence, missing_fields, created_at, updated_at
       FROM cases WHERE ${where}
       ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      values
    );

    res.json({ cases: result.rows, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

// GET /api/cases/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cases WHERE id = $1 AND deleted_at IS NULL', [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Fall nicht gefunden.' });
    res.json({ case: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

// PUT /api/cases/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const allowed = [
      'unfall_datum','unfall_uhrzeit','unfall_strasse','unfall_ort','unfall_land',
      'mandant_name','mandant_strasse','mandant_plz','mandant_ort','mandant_telefon',
      'mandant_mobil','mandant_email','mandant_vorsteuerabzug','mandant_war_fahrer',
      'fahrer_name','fahrer_adresse',
      'bank_iban','bank_inhaber','bank_name','bank_bic',
      'kfz_versicherung_name','kfz_versicherung_nr','teilkasko','teilkasko_sb','vollkasko','vollkasko_sb',
      'fahrzeug_typ','fahrzeug_kennzeichen','fahrzeug_abgeschleppt','fahrzeug_fahrbereit',
      'fahrzeug_scheckheft','fahrzeug_vorschaeden','fahrzeug_leasing','fahrzeug_leasing_wo',
      'fahrzeug_leasing_nr','fahrzeug_finanzierung','fahrzeug_finanzierung_wo','fahrzeug_finanzierung_nr',
      'rsv_name','rsv_nr','rsv_selbstbeteiligung','rsv_sb_hoehe',
      'mietwagen_genommen','mietwagen_von','mietwagen_bis','mietwagen_bei',
      'gegner_name','gegner_strasse','gegner_plz','gegner_ort','gegner_fahrzeug',
      'gegner_kennzeichen','gegner_versicherung','gegner_versicherung_nr','gegner_schaden_nr',
      'unfall_schilderung','zeugen','personenschaeden','geschaedigter_name',
      'behandelnder_arzt','arzt_adresse','polizei_aufgenommen','polizei_aktenzeichen',
      'polizei_dienststelle','gutachten_beauftragt','gutachter_name','gutachter_adresse','status'
    ];

    const updates = [];
    const values = [];
    let i = 1;

    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Keine Felder zum Aktualisieren.' });
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(
      `UPDATE cases SET ${updates.join(', ')} WHERE id = $${i} AND deleted_at IS NULL`,
      values
    );

    await auditLog({ caseId: req.params.id, userId: req.user.id, action: 'case_updated', newValues: req.body, ipAddress: req.ip });

    const result = await pool.query('SELECT * FROM cases WHERE id = $1', [req.params.id]);
    res.json({ case: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler: ' + err.message });
  }
});

// DELETE /api/cases/:id (Soft Delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE cases SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    await auditLog({ caseId: req.params.id, userId: req.user.id, action: 'case_deleted', ipAddress: req.ip });
    res.json({ message: 'Fall gelöscht.' });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

// GET /api/cases/:id/export?format=csv|json|xml
router.get('/:id/export', auth, async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const result = await pool.query('SELECT * FROM cases WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    const c = result.rows[0];
    if (!c) return res.status(404).json({ error: 'Fall nicht gefunden.' });

    const name = (c.mandant_name || 'fall').replace(/[^a-zA-Z0-9]/g, '_');
    const date = c.unfall_datum ? new Date(c.unfall_datum).toISOString().split('T')[0] : 'kein_datum';

    await pool.query("UPDATE cases SET status = 'importiert', updated_at = NOW() WHERE id = $1", [c.id]);
    await auditLog({ caseId: c.id, userId: req.user.id, action: `export_${format}`, ipAddress: req.ip });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${name}_${date}.json"`);
      return res.send(toJSON(c));
    }
    if (format === 'xml') {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${name}_${date}.xml"`);
      return res.send(toXML(c));
    }
    // Default: CSV
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}_${date}.csv"`);
    res.send('\uFEFF' + toCSV(c)); // BOM für Excel
  } catch (err) {
    res.status(500).json({ error: 'Export fehlgeschlagen.' });
  }
});

// GET /api/cases/stats/overview
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total,
        COUNT(*) FILTER (WHERE status = 'neu' AND deleted_at IS NULL) as neu,
        COUNT(*) FILTER (WHERE status = 'unvollstaendig' AND deleted_at IS NULL) as unvollstaendig,
        COUNT(*) FILTER (WHERE status = 'bereit' AND deleted_at IS NULL) as bereit,
        COUNT(*) FILTER (WHERE status = 'importiert' AND deleted_at IS NULL) as importiert,
        COUNT(*) FILTER (WHERE status = 'fehler' AND deleted_at IS NULL) as fehler,
        AVG(ai_confidence) FILTER (WHERE deleted_at IS NULL) as avg_confidence
      FROM cases
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

module.exports = router;
