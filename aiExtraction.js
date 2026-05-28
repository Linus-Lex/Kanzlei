const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Du bist ein spezialisierter KI-Assistent für eine Anwaltskanzlei. 
Deine Aufgabe ist es, Unfallaufnahmeformulare zu analysieren und alle relevanten Daten strukturiert zu extrahieren.

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Kein erklärender Text davor oder danach.
Verwende null für Felder, die nicht im Formular vorhanden sind.
Füge bei jedem extrahierten Feld einen confidence-Wert zwischen 0 und 1 hinzu.

Das JSON-Format ist exakt wie folgt:
{
  "data": {
    "unfall_datum": "YYYY-MM-DD oder null",
    "unfall_uhrzeit": "HH:MM oder null",
    "unfall_strasse": "string oder null",
    "unfall_ort": "string oder null",
    "unfall_land": "string oder null",
    "mandant_name": "string oder null",
    "mandant_strasse": "string oder null",
    "mandant_plz": "string oder null",
    "mandant_ort": "string oder null",
    "mandant_telefon": "string oder null",
    "mandant_mobil": "string oder null",
    "mandant_email": "string oder null",
    "mandant_vorsteuerabzug": true/false/null,
    "mandant_war_fahrer": true/false/null,
    "fahrer_name": "string oder null",
    "fahrer_adresse": "string oder null",
    "bank_iban": "string oder null",
    "bank_inhaber": "string oder null",
    "bank_name": "string oder null",
    "bank_bic": "string oder null",
    "kfz_versicherung_name": "string oder null",
    "kfz_versicherung_nr": "string oder null",
    "teilkasko": true/false/null,
    "teilkasko_sb": "string oder null",
    "vollkasko": true/false/null,
    "vollkasko_sb": "string oder null",
    "fahrzeug_typ": "string oder null",
    "fahrzeug_kennzeichen": "string oder null",
    "fahrzeug_abgeschleppt": true/false/null,
    "fahrzeug_fahrbereit": true/false/null,
    "fahrzeug_scheckheft": true/false/null,
    "fahrzeug_vorschaeden": true/false/null,
    "fahrzeug_leasing": true/false/null,
    "fahrzeug_leasing_wo": "string oder null",
    "fahrzeug_leasing_nr": "string oder null",
    "fahrzeug_finanzierung": true/false/null,
    "fahrzeug_finanzierung_wo": "string oder null",
    "fahrzeug_finanzierung_nr": "string oder null",
    "rsv_name": "string oder null",
    "rsv_nr": "string oder null",
    "rsv_selbstbeteiligung": true/false/null,
    "rsv_sb_hoehe": "string oder null",
    "mietwagen_genommen": true/false/null,
    "mietwagen_von": "YYYY-MM-DD oder null",
    "mietwagen_bis": "YYYY-MM-DD oder null",
    "mietwagen_bei": "string oder null",
    "gegner_name": "string oder null",
    "gegner_strasse": "string oder null",
    "gegner_plz": "string oder null",
    "gegner_ort": "string oder null",
    "gegner_fahrzeug": "string oder null",
    "gegner_kennzeichen": "string oder null",
    "gegner_versicherung": "string oder null",
    "gegner_versicherung_nr": "string oder null",
    "gegner_schaden_nr": "string oder null",
    "unfall_schilderung": "string oder null",
    "zeugen": "string oder null",
    "personenschaeden": true/false/null,
    "geschaedigter_name": "string oder null",
    "behandelnder_arzt": "string oder null",
    "arzt_adresse": "string oder null",
    "polizei_aufgenommen": true/false/null,
    "polizei_aktenzeichen": "string oder null",
    "polizei_dienststelle": "string oder null",
    "gutachten_beauftragt": true/false/null,
    "gutachter_name": "string oder null",
    "gutachter_adresse": "string oder null"
  },
  "confidence": {
    "overall": 0.0,
    "fields": {}
  }
}`;

// Pflichtfelder und ihre Bedeutung für die Vollständigkeitsprüfung
const REQUIRED_FIELDS = {
  unfall_datum: 'Unfalldatum – für Fristen und Verjährung zwingend erforderlich',
  unfall_ort: 'Unfallort – für die Zuständigkeit und Beweissicherung erforderlich',
  mandant_name: 'Name des Mandanten – für die Fallanlage erforderlich',
  mandant_telefon: 'Telefonnummer des Mandanten – für Rückfragen erforderlich',
  mandant_email: 'E-Mail des Mandanten – für die Kommunikation erforderlich',
  fahrzeug_kennzeichen: 'Kennzeichen des eigenen Fahrzeugs – für Versicherungsabfragen erforderlich',
  gegner_kennzeichen: 'Kennzeichen des Unfallgegners – für die Haftpflichtversicherung erforderlich',
  gegner_versicherung: 'Versicherung des Unfallgegners – für Schadenregulierung erforderlich',
  bank_iban: 'IBAN – für Schadensauszahlung erforderlich',
};

const FIELD_LABELS = {
  unfall_datum: 'Unfalldatum',
  unfall_uhrzeit: 'Unfallzeit',
  unfall_strasse: 'Unfallstraße',
  unfall_ort: 'Unfallort',
  unfall_land: 'Unfallland',
  mandant_name: 'Name des Mandanten',
  mandant_strasse: 'Straße des Mandanten',
  mandant_plz: 'PLZ des Mandanten',
  mandant_ort: 'Ort des Mandanten',
  mandant_telefon: 'Telefon des Mandanten',
  mandant_mobil: 'Mobil des Mandanten',
  mandant_email: 'E-Mail des Mandanten',
  fahrzeug_kennzeichen: 'Kennzeichen eigenes Fahrzeug',
  fahrzeug_typ: 'Fahrzeugtyp',
  gegner_name: 'Name Unfallgegner',
  gegner_kennzeichen: 'Kennzeichen Unfallgegner',
  gegner_versicherung: 'Versicherung Unfallgegner',
  bank_iban: 'IBAN',
  kfz_versicherung_name: 'KFZ-Versicherung',
  polizei_aufgenommen: 'Polizeiliche Aufnahme',
};

async function extractFromText(text) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analysiere dieses Unfallaufnahmeformular und extrahiere alle Daten:\n\n${text}`
      }
    ]
  });

  const responseText = message.content[0].text;
  
  // JSON sauber parsen
  const clean = responseText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  // Fehlende Pflichtfelder ermitteln
  const missingFields = [];
  for (const [field, reason] of Object.entries(REQUIRED_FIELDS)) {
    const value = parsed.data[field];
    if (value === null || value === undefined || value === '') {
      missingFields.push({
        field,
        label: FIELD_LABELS[field] || field,
        reason,
        action: `Bitte Mandanten kontaktieren und "${FIELD_LABELS[field] || field}" ergänzen.`
      });
    }
  }

  // Overall confidence berechnen
  const confidenceValues = Object.values(parsed.confidence?.fields || {});
  const overallConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0.5;

  return {
    data: parsed.data,
    missingFields,
    fieldConfidence: parsed.confidence?.fields || {},
    overallConfidence: Math.round(overallConfidence * 100) / 100
  };
}

module.exports = { extractFromText, FIELD_LABELS, REQUIRED_FIELDS };
