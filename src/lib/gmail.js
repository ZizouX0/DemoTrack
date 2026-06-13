// One-click demo sending from the user's OWN Gmail (Spec: send-all automation).
//
// Uses Google Identity Services (client-side token flow) to get a short-lived
// access token for the gmail.send scope, then calls the Gmail API to send each
// email AS THE USER — so demos come from their real address and replies go to
// them. No server, no stored refresh token: a token is requested once per
// session (a silent grant after the first consent) and reused for the batch.
//
// Setup (one-time, see README): create a Google OAuth Web client with the app
// origin in "Authorized JavaScript origins", enable the Gmail API, and set
// VITE_GOOGLE_CLIENT_ID. Without it, the app falls back to mailto/Gmail-compose.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export function isGmailConfigured() {
  return Boolean(CLIENT_ID)
}

let gisPromise = null
function loadGis() {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'))
    document.head.appendChild(s)
  })
  return gisPromise
}

let tokenClient = null
let cachedToken = null // { token, expiresAt }

// Resolve to a valid access token, reusing the cached one when possible.
// `interactive: false` attempts a silent grant (no popup) and rejects if the
// user must consent; `true` shows the Google account chooser / consent.
async function getAccessToken({ interactive = true } = {}) {
  if (!CLIENT_ID) throw new Error('Gmail sending is not configured (VITE_GOOGLE_CLIENT_ID missing).')
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token
  await loadGis()
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: () => {},
      })
    }
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error))
        return
      }
      cachedToken = {
        token: resp.access_token,
        expiresAt: Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3_600_000),
      }
      resolve(resp.access_token)
    }
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' })
    } catch (e) {
      reject(e)
    }
  })
}

// Connect Gmail — call from a user gesture (button). Triggers consent the first
// time, then the grant is remembered by Google for silent re-issue.
export async function connectGmail() {
  await getAccessToken({ interactive: true })
  return true
}

export function isGmailConnected() {
  return Boolean(cachedToken && cachedToken.expiresAt > Date.now() + 60_000)
}

export function disconnectGmail() {
  cachedToken = null
}

// UTF-8 → base64url (for the Gmail `raw` field).
function b64url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// UTF-8 → standard base64 (for RFC 2047 encoded-word headers).
function b64std(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function hasNonAscii(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return true
  }
  return false
}

function encodeSubject(s) {
  return hasNonAscii(s) ? `=?UTF-8?B?${b64std(s)}?=` : s
}

// Send one email as the signed-in user. Reuses the session token; will prompt
// once if none is cached yet.
export async function sendGmail({ to, subject, body }) {
  if (!to) throw new Error('No recipient address.')
  let token
  try {
    token = await getAccessToken({ interactive: false })
  } catch {
    token = await getAccessToken({ interactive: true })
  }

  const mime = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject || '')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body || '',
  ].join('\r\n')

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime) }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Gmail send failed (${res.status}): ${t.slice(0, 200)}`)
  }
  return res.json()
}
