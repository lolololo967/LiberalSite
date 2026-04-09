const crypto = require('crypto');
const https  = require('https');

// ── Token verification ────────────────────────────────────────────────────────
function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = token.slice(0, dotIdx);
  const sig     = token.slice(dotIdx + 1);
  const secret  = process.env.TOKEN_SECRET || 'changeme-set-in-vercel';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    return data.admin === true && data.exp > Date.now();
  } catch { return false; }
}

// ── Supabase REST helper ──────────────────────────────────────────────────────
function sbRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const base = process.env.SUPABASE_URL;
    const key  = process.env.SUPABASE_SERVICE_KEY;
    if (!base || !key) return reject(new Error('Missing Supabase env vars'));

    const url     = new URL(`${base}/rest/v1${path}`);
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const req = https.request(opts, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const d = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ status: r.statusCode, data: JSON.parse(d || 'null') }); }
        catch { resolve({ status: r.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET — public ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await sbRequest('GET', '/constitution?id=eq.1&select=*');
      const row = Array.isArray(r.data) && r.data.length > 0 ? r.data[0] : null;
      return res.status(200).json(row || { pdf_data: null, chapters: [] });
    }

    // ── Write operations require admin token ──────────────────────────────────
    if (!verifyToken(req)) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    // ── POST — upsert (create or replace the single constitution record) ──────
    if (req.method === 'POST') {
      const { pdf_data, chapters } = req.body || {};

      // Check whether row id=1 exists
      const check = await sbRequest('GET', '/constitution?id=eq.1&select=id');
      const exists = Array.isArray(check.data) && check.data.length > 0;

      const payload = {
        id:          1,
        pdf_data:    pdf_data    !== undefined ? pdf_data    : null,
        chapters:    Array.isArray(chapters)   ? chapters    : [],
        updated_at:  new Date().toISOString(),
      };

      let r;
      if (exists) {
        // PATCH existing row
        r = await sbRequest('PATCH', '/constitution?id=eq.1', payload);
      } else {
        // INSERT new row
        r = await sbRequest('POST', '/constitution', payload);
      }

      return res.status(r.status).json(r.data);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (e) {
    console.error('[api/constitution]', e);
    return res.status(500).json({ error: e.message });
  }
};
