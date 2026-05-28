# Kanzlei KI – Unfallaufnahme

KI-gestützte Fallerfassung für Anwaltskanzleien. Automatisches Auslesen von Unfallaufnahmeformularen (PDF/Scan) per OCR und Claude AI, mit Outlook-Integration und RA-MICRO-Export.

---

## Funktionsumfang

- **Upload & OCR**: PDF und Bilder (JPG, PNG, TIFF, WEBP) werden per OCR in Text umgewandelt
- **KI-Extraktion**: Claude AI liest alle 60+ Felder des UAF-Formulars aus
- **Vollständigkeitsprüfung**: Automatische Erkennung fehlender Pflichtfelder mit konkreten Handlungsempfehlungen
- **Bearbeitung**: Manuelle Nachbearbeitung aller Felder direkt im Browser
- **Export**: CSV (Excel-kompatibel mit BOM), JSON und XML für RA-MICRO P-Version
- **Outlook-Integration**: Automatischer Abruf neuer E-Mails mit Formular-Anhängen
- **Benutzerverwaltung**: Admin und Sachbearbeiter-Rollen
- **Audit-Log**: Alle Änderungen werden protokolliert

---

## Deployment auf Render.com

### 1. GitHub Repository anlegen

Alle Dateien in ein neues GitHub-Repository hochladen.

### 2. Render Account + Services anlegen

1. Auf [render.com](https://render.com) einloggen
2. **New → Blueprint** → dein GitHub-Repo auswählen
3. Render liest `render.yaml` und legt automatisch an:
   - Web Service `kanzlei-ki`
   - PostgreSQL Datenbank `kanzlei-ki-db`

### 3. Umgebungsvariablen eintragen

Im Render Dashboard → dein Web Service → **Environment**:

| Variable | Wert |
|---|---|
| `ANTHROPIC_API_KEY` | Dein Anthropic API Key |
| `AZURE_CLIENT_ID` | Azure App Client ID |
| `AZURE_CLIENT_SECRET` | Azure App Client Secret |
| `AZURE_REDIRECT_URI` | `https://DEINE-APP.onrender.com/api/outlook/callback` |

`JWT_SECRET` und `SESSION_SECRET` werden von Render automatisch generiert.

### 4. Datenbank migrieren

Im Render Dashboard → dein Web Service → **Shell**:

```bash
node scripts/migrate.js
node scripts/seed.js admin@deinemail.de SicheresPasswort123! "Dein Name"
```

### 5. Fertig!

Die App ist unter `https://kanzlei-ki.onrender.com` erreichbar.

---

## Azure App Registration (Outlook, Option A)

1. [portal.azure.com](https://portal.azure.com) → **App-Registrierungen** → **Neue Registrierung**
2. Name: `Kanzlei KI`
3. Unterstützte Kontotypen: **Konten in beliebigen Organisationsverzeichnissen und persönliche Microsoft-Konten**
4. Umleitungs-URI: `https://DEINE-APP.onrender.com/api/outlook/callback` (Typ: Web)
5. Nach Registrierung: **Certificates & Secrets** → **New client secret** → Geheimnis kopieren
6. **API-Berechtigungen** → **Microsoft Graph** → **Delegiert**:
   - `Mail.Read`
   - `offline_access`
   - `User.Read`
7. Client ID und Tenant `common` in Render Environment eintragen

Jede Kanzlei klickt einmal im Dashboard auf **„Mit Outlook verbinden"** und loggt sich mit ihrem Microsoft-Konto ein. Die Tokens werden sicher in der Datenbank gespeichert.

---

## RA-MICRO Export

Der CSV-Export ist für die RA-MICRO P-Version ausgelegt:
- Semikolon-getrennt (`;`)
- UTF-8 mit BOM (Excel-kompatibel)
- Alle Felder in der ersten Zeile als Header

**Import in RA-MICRO:**
1. CSV-Datei exportieren
2. RA-MICRO → Aktenverwaltung → Import → CSV
3. Felder mappen (Header stimmen mit RA-MICRO P-Version überein)

Der XML-Export kann für zukünftige RA-MICRO API-Integration verwendet werden.

---

## Lokale Entwicklung

```bash
# .env anlegen (aus .env.example)
cp .env.example .env
# Werte eintragen

# Abhängigkeiten installieren
npm install

# Datenbank migrieren
node scripts/migrate.js

# Admin anlegen
node scripts/seed.js

# Server starten
npm run dev
```

Server läuft auf `http://localhost:3000`

---

## Erweiterbarkeit

### Mehrere Kanzleien (Multi-Tenant)
Die Datenbank und der Code sind so strukturiert, dass eine `kanzlei_id`-Spalte ergänzt werden kann. Alle Queries können dann pro Kanzlei gefiltert werden.

### RA-MICRO API (wenn verfügbar)
Die Datei `backend/services/raExport.js` enthält die Export-Logik. Bei verfügbarer RA-MICRO API kann dort die direkte API-Integration ergänzt werden, ohne dass andere Teile der App geändert werden müssen.

### E-Mail-Polling (automatisch, ohne manuellen Sync)
Ein Cron-Job (z. B. via Render Cron Service) kann `POST /api/outlook/sync` regelmäßig aufrufen.

---

## Datenschutz-Hinweis

- Hochgeladene Dateien werden auf dem Server gespeichert (`/tmp/uploads` auf Render)
- Das Audit-Log speichert **keine** Personendaten, nur welche Felder geändert wurden
- Für Produktivbetrieb: DSGVO-konforme Datenspeicherung und Auftragsverarbeitungsvertrag mit Render und Anthropic prüfen
