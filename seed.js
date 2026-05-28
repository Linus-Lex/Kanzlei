require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function seed() {
  const email = process.argv[2] || 'admin@kanzlei.de';
  const password = process.argv[3] || 'Admin1234!';
  const name = process.argv[4] || 'Administrator';

  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
      [email, hash, name]
    );
    console.log(`✅ Admin-Benutzer angelegt: ${email} / ${password}`);
    console.log('   Bitte Passwort nach erstem Login ändern!');
  } catch (err) {
    console.error('❌ Fehler:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
