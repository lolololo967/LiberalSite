const crypto = require('crypto');
const https = require('https');

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

function sbRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
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
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(d || 'null') }); }
        catch { resolve({ status: r.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const r = await sbRequest('GET', '/cards?order=date.desc&select=*');
      return res.status(r.status).json(r.data || []);
    }

    if (!verifyToken(req)) return res.status(401).json({ error: 'Не авторизован' });

    if (req.method === 'POST') {
      const r = await sbRequest('POST', '/cards', req.body);
      return res.status(r.status).json(r.data);
    }

    if (req.method === 'PUT') {
      const { id, ...body } = req.body;
      if (!id) return res.status(400).json({ error: 'Нет id' });
      const r = await sbRequest('PATCH', `/cards?id=eq.${id}`, body);
      return res.status(r.status).json(r.data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Нет id' });
      const r = await sbRequest('DELETE', `/cards?id=eq.${id}`);
      return res.status(r.status).json({ success: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
