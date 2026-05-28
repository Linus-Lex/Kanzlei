const fetch = require('node-fetch');
const pool = require('../config/db');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// OAuth2 Authorization URL generieren (Option A: zentrale Azure App)
function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.AZURE_REDIRECT_URI,
    scope: 'offline_access Mail.Read User.Read',
    state,
    response_mode: 'query',
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

// Token gegen Code tauschen
async function exchangeCode(code) {
  const resp = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      code,
      redirect_uri: process.env.AZURE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = await resp.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

// Access Token erneuern
async function refreshAccessToken(refreshToken) {
  const resp = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access Mail.Read User.Read',
    }),
  });

  const data = await resp.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

// GÃ¼ltigen Access Token holen (mit Auto-Refresh)
async function getValidToken(connectionId) {
  const result = await pool.query(
    'SELECT * FROM outlook_connections WHERE id = $1 AND is_active = true',
    [connectionId]
  );

  const conn = result.rows[0];
  if (!conn) throw new Error('Outlook-Verbindung nicht gefunden.');

  // Token abgelaufen?
  const expiresAt = new Date(conn.token_expires_at);
  const now = new Date();

  if (expiresAt <= now) {
    // Refresh
    const newTokenData = await refreshAccessToken(conn.refresh_token);
    const newExpiry = new Date(Date.now() + newTokenData.expires_in * 1000);

    await pool.query(
      `UPDATE outlook_connections 
       SET access_token = $1, token_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [newTokenData.access_token, newExpiry.toISOString(), connectionId]
    );

    return newTokenData.access_token;
  }

  return conn.access_token;
}

// E-Mails mit AnhÃ¤ngen abrufen
async function fetchNewEmails(connectionId) {
  const token = await getValidToken(connectionId);

  // Ungelesene E-Mails mit AnhÃ¤ngen holen
  const resp = await fetch(
    `${GRAPH_BASE}/me/messages?$filter=isRead eq false and hasAttachments eq true&$top=20&$select=id,subject,from,receivedDateTime,hasAttachments`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.value || [];
}

// Anhang einer E-Mail herunterladen
async function getEmailAttachment(connectionId, messageId, attachmentId) {
  const token = await getValidToken(connectionId);

  const resp = await fetch(
    `${GRAPH_BASE}/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);

  return {
    name: data.name,
    contentType: data.contentType,
    contentBytes: Buffer.from(data.contentBytes, 'base64'),
  };
}

// AnhÃ¤nge einer E-Mail auflisten
async function listAttachments(connectionId, messageId) {
  const token = await getValidToken(connectionId);

  const resp = await fetch(
    `${GRAPH_BASE}/me/messages/${messageId}/attachments?$select=id,name,contentType,size`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.value || [];
}

// E-Mail als gelesen markieren
async function markAsRead(connectionId, messageId) {
  const token = await getValidToken(connectionId);

  await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isRead: true }),
  });
}

// Profil des verbundenen Accounts
async function getUserProfile(accessToken) {
  const resp = await fetch(`${GRAPH_BASE}/me?$select=mail,displayName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getValidToken,
  fetchNewEmails,
  getEmailAttachment,
  listAttachments,
  markAsRead,
  getUserProfile,
};
