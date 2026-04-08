const crypto = require('crypto');
const https = require('https');

// ── Token verification (same logic as cards.js) ──────────────────────────────
function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const secret = process.env.TOKEN_SECRET || 'changeme-set-in-vercel';
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

    const url = new URL(`${base}/rest/v1${path}`);
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET — public, no auth ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await sbRequest('GET', '/parties?order=created_at.asc&select=*');
      return res.status(r.status).json(r.data || []);
    }

    // ── All write operations require a valid admin token ─────────────────────
    if (!verifyToken(req)) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    // ── POST — create new party ──────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, tag, description, compass_x, compass_y, color, status, flag_image, symbol_image } = req.body || {};

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Поле "name" обязательно' });
      }

      const payload = {
        name:         String(name).trim(),
        tag:          tag          ? String(tag).trim()         : null,
        description:  description  ? String(description).trim() : null,
        compass_x:    Number.isFinite(Number(compass_x)) ? Math.round(Number(compass_x)) : 0,
        compass_y:    Number.isFinite(Number(compass_y)) ? Math.round(Number(compass_y)) : 0,
        color:        color        ? String(color)               : '#9B30FF',
        status:       ['ruling','opposition','coalition','minor','inactive'].includes(status)
                        ? status : 'ruling',
        flag_image:   flag_image   || null,
        symbol_image: symbol_image || null,
      };

      const r = await sbRequest('POST', '/parties', payload);
      return res.status(r.status).json(r.data);
    }

    // ── PUT — update existing party ──────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Поле "id" обязательно' });

      // Only allow known updatable columns
      const allowed = ['name','tag','description','compass_x','compass_y','color','status','flag_image','symbol_image'];
      const patch = {};
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
          patch[key] = fields[key] ?? null;
        }
      }
      if (patch.name !== undefined) patch.name = String(patch.name).trim();
      if (!patch.name) return res.status(400).json({ error: 'Поле "name" не может быть пустым' });

      const r = await sbRequest('PATCH', `/parties?id=eq.${encodeURIComponent(id)}`, patch);
      return res.status(r.status).json(r.data);
    }

    // ── DELETE — remove party ────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Поле "id" обязательно' });

      const r = await sbRequest('DELETE', `/parties?id=eq.${encodeURIComponent(id)}`);
      return res.status(r.status).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (e) {
    console.error('[api/parties]', e);
    return res.status(500).json({ error: e.message });
  }
};
