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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ══ GET — все отзывы ══
    if (req.method === 'GET') {
      const r = await sbRequest('GET', '/reviews?order=created_at.asc&select=*');
      return res.status(r.status).json(r.data || []);
    }

    // ══ POST — новый отзыв (публично) ══
    if (req.method === 'POST') {
      const { name, text, rating } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim())
        return res.status(400).json({ error: 'Укажите имя' });
      if (!text || typeof text !== 'string' || text.trim().length < 3)
        return res.status(400).json({ error: 'Отзыв слишком короткий' });
      if (!['like', 'dislike'].includes(rating))
        return res.status(400).json({ error: 'Укажите оценку' });

      const r = await sbRequest('POST', '/reviews', {
        name: name.trim().slice(0, 50),
        text: text.trim().slice(0, 800),
        rating,
      });
      return res.status(r.status).json(r.data);
    }

    // ══ PUT — ответ администратора ══
    if (req.method === 'PUT') {
      if (!verifyToken(req)) return res.status(401).json({ error: 'Не авторизован' });

      const { id, reply } = req.body || {};
      if (!id || !reply || typeof reply !== 'string' || !reply.trim())
        return res.status(400).json({ error: 'Неверные данные' });

      const r = await sbRequest('PATCH', `/reviews?id=eq.${id}`, {
        reply_text: reply.trim().slice(0, 800),
        reply_at: new Date().toISOString(),
      });
      return res.status(r.status).json(r.data);
    }

    // ══ DELETE — удаление отзыва (только админ) ══
    if (req.method === 'DELETE') {
      if (!verifyToken(req)) return res.status(401).json({ error: 'Не авторизован' });

      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Нет id' });

      const r = await sbRequest('DELETE', `/reviews?id=eq.${id}`);
      return res.status(r.status).json({ success: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
