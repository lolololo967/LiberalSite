const crypto = require('crypto');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  const payload = Buffer.from(JSON.stringify({
    admin: true,
    exp: Date.now() + 24 * 60 * 60 * 1000
  })).toString('base64');

  const secret = process.env.TOKEN_SECRET || 'changeme-set-in-vercel';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return res.json({ token: `${payload}.${sig}` });
};
