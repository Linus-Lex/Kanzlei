require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users / Kanzlei-Mitarbeiter
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'sachbearbeiter', -- admin | sachbearbeiter
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Outlook-Token-Speicher pro Kanzlei (Option A: eine Azure App)
    await client.query(`
      CREATE TABLE IF NOT EXISTS outlook_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connected_by UUID REFERENCES users(id),
        email_address VARCHAR(255) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Fälle / Unfallaufnahmen
    await client.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(50) NOT NULL DEFAULT 'neu', -- neu | in_pruefung | unvollstaendig | bereit | importiert
        source VARCHAR(50) NOT NULL DEFAULT 'upload', -- upload | email
        original_filename VARCHAR(500),
        file_path TEXT,
        raw_text TEXT,
        ai_confidence DECIMAL(5,2),
        
        -- Unfalldaten
        unfall_datum DATE,
        unfall_uhrzeit TIME,
        unfall_strasse TEXT,
        unfall_ort VARCHAR(255),
        unfall_land VARCHAR(100),
        
        -- Mandant
        mandant_name VARCHAR(255),
        mandant_strasse TEXT,
        mandant_plz VARCHAR(20),
        mandant_ort VARCHAR(255),
        mandant_telefon VARCHAR(100),
        mandant_mobil VARCHAR(100),
        mandant_email VARCHAR(255),
        mandant_vorsteuerabzug BOOLEAN,
        mandant_war_fahrer BOOLEAN,
        
        -- Fahrer (falls nicht Mandant)
        fahrer_name VARCHAR(255),
        fahrer_adresse TEXT,
        
        -- Bankverbindung
        bank_iban VARCHAR(50),
        bank_inhaber VARCHAR(255),
        bank_name VARCHAR(255),
        bank_bic VARCHAR(20),
        
        -- Eigene KFZ-Versicherung
        kfz_versicherung_name VARCHAR(255),
        kfz_versicherung_nr VARCHAR(100),
        teilkasko BOOLEAN,
        teilkasko_sb VARCHAR(100),
        vollkasko BOOLEAN,
        vollkasko_sb VARCHAR(100),
        
        -- Eigenes Fahrzeug
        fahrzeug_typ VARCHAR(255),
        fahrzeug_kennzeichen VARCHAR(50),
        fahrzeug_abgeschleppt BOOLEAN,
        fahrzeug_fahrbereit BOOLEAN,
        fahrzeug_scheckheft BOOLEAN,
        fahrzeug_vorschaeden BOOLEAN,
        fahrzeug_leasing BOOLEAN,
        fahrzeug_leasing_wo VARCHAR(255),
        fahrzeug_leasing_nr VARCHAR(100),
        fahrzeug_finanzierung BOOLEAN,
        fahrzeug_finanzierung_wo VARCHAR(255),
        fahrzeug_finanzierung_nr VARCHAR(100),
        
        -- Rechtsschutzversicherung
        rsv_name VARCHAR(255),
        rsv_nr VARCHAR(100),
        rsv_selbstbeteiligung BOOLEAN,
        rsv_sb_hoehe VARCHAR(100),
        
        -- Mietwagen
        mietwagen_genommen BOOLEAN,
        mietwagen_von DATE,
        mietwagen_bis DATE,
        mietwagen_bei VARCHAR(255),
        
        -- Unfallgegner
        gegner_name VARCHAR(255),
        gegner_strasse TEXT,
        gegner_plz VARCHAR(20),
        gegner_ort VARCHAR(255),
        gegner_fahrzeug VARCHAR(255),
        gegner_kennzeichen VARCHAR(50),
        gegner_versicherung VARCHAR(255),
        gegner_versicherung_nr VARCHAR(100),
        gegner_schaden_nr VARCHAR(100),
        
        -- Unfallschilderung
        unfall_schilderung TEXT,
        zeugen TEXT,
        
        -- Personenschäden
        personenschaeden BOOLEAN,
        geschaedigter_name VARCHAR(255),
        behandelnder_arzt TEXT,
        arzt_adresse TEXT,
        
        -- Polizei
        polizei_aufgenommen BOOLEAN,
        polizei_aktenzeichen VARCHAR(100),
        polizei_dienststelle TEXT,
        
        -- Gutachten
        gutachten_beauftragt BOOLEAN,
        gutachter_name VARCHAR(255),
        gutachter_adresse TEXT,
        
        -- Fehlende Felder (JSON-Array)
        missing_fields JSONB DEFAULT '[]',
        -- KI-Confidence pro Feld (JSON-Object)
        field_confidence JSONB DEFAULT '{}',
        
        -- Metadaten
        outlook_message_id VARCHAR(500),
        assigned_to UUID REFERENCES users(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    // Audit-Log
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Migration erfolgreich abgeschlossen.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration fehlgeschlagen:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
