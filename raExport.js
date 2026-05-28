const { FIELD_LABELS } = require('./aiExtraction');

/**
 * Bereitet einen Fall für den Export vor.
 * Aktuell: CSV und strukturiertes JSON (erweiterbar für echte RA-MICRO API).
 */

function buildExportData(caseData) {
  return {
    // Mandant
    'Nachname': extractLastName(caseData.mandant_name),
    'Vorname': extractFirstName(caseData.mandant_name),
    'Straße': caseData.mandant_strasse || '',
    'PLZ': caseData.mandant_plz || '',
    'Ort': caseData.mandant_ort || '',
    'Telefon': caseData.mandant_telefon || '',
    'Mobil': caseData.mandant_mobil || '',
    'E-Mail': caseData.mandant_email || '',

    // Unfall
    'Unfalldatum': formatDate(caseData.unfall_datum),
    'Unfallzeit': caseData.unfall_uhrzeit || '',
    'Unfallort': [caseData.unfall_strasse, caseData.unfall_ort, caseData.unfall_land].filter(Boolean).join(', '),

    // Fahrzeug
    'Fahrzeugtyp': caseData.fahrzeug_typ || '',
    'Kennzeichen': caseData.fahrzeug_kennzeichen || '',

    // Gegner
    'Gegner Name': caseData.gegner_name || '',
    'Gegner Kennzeichen': caseData.gegner_kennzeichen || '',
    'Gegner Versicherung': caseData.gegner_versicherung || '',
    'Gegner Versicherungsnr.': caseData.gegner_versicherung_nr || '',
    'Schadennummer': caseData.gegner_schaden_nr || '',

    // Versicherung
    'KFZ-Versicherung': caseData.kfz_versicherung_name || '',
    'KFZ-Versicherungsnr.': caseData.kfz_versicherung_nr || '',
    'Rechtsschutzversicherung': caseData.rsv_name || '',
    'RSV-Nr.': caseData.rsv_nr || '',

    // Bank
    'IBAN': caseData.bank_iban || '',
    'BIC': caseData.bank_bic || '',
    'Kontoinhaber': caseData.bank_inhaber || '',
    'Bank': caseData.bank_name || '',

    // Polizei
    'Polizeilich aufgenommen': caseData.polizei_aufgenommen ? 'Ja' : 'Nein',
    'Aktenzeichen': caseData.polizei_aktenzeichen || '',
    'Dienststelle': caseData.polizei_dienststelle || '',

    // Schilderung
    'Unfallschilderung': caseData.unfall_schilderung || '',
    'Zeugen': caseData.zeugen || '',
  };
}

function toCSV(caseData) {
  const data = buildExportData(caseData);
  const headers = Object.keys(data);
  const values = Object.values(data).map(v =>
    `"${String(v).replace(/"/g, '""')}"`
  );
  return headers.join(';') + '\n' + values.join(';');
}

function toJSON(caseData) {
  return JSON.stringify(buildExportData(caseData), null, 2);
}

function toXML(caseData) {
  const data = buildExportData(caseData);
  const fields = Object.entries(data)
    .map(([k, v]) => {
      const tag = k.replace(/[^a-zA-Z0-9_]/g, '_');
      return `  <${tag}>${escapeXML(v)}</${tag}>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<RAMicroImport>
  <Version>1.0</Version>
  <Exportdatum>${new Date().toISOString()}</Exportdatum>
  <Mandant>
${fields}
  </Mandant>
</RAMicroImport>`;
}

// Hilfsfunktionen
function extractLastName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

function extractFirstName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts.slice(0, -1).join(' ');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('de-DE');
  } catch { return dateStr; }
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { toCSV, toJSON, toXML, buildExportData };
