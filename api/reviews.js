import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ══ GET — все отзывы ══
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ══ POST — новый отзыв ══
  if (req.method === 'POST') {
    const { name, text, rating } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 1)
      return res.status(400).json({ error: 'Укажите имя' });
    if (!text || typeof text !== 'string' || text.trim().length < 3)
      return res.status(400).json({ error: 'Отзыв слишком короткий' });
    if (!['like', 'dislike'].includes(rating))
      return res.status(400).json({ error: 'Укажите оценку' });

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        name: name.trim().slice(0, 50),
        text: text.trim().slice(0, 800),
        rating,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // ══ PUT — ответ администратора ══
  if (req.method === 'PUT') {
    const auth = req.headers['authorization'] || '';
    if (!ADMIN_TOKEN || auth !== 'Bearer ' + ADMIN_TOKEN)
      return res.status(401).json({ error: 'Unauthorized' });

    const { id, reply } = req.body || {};
    if (!id || !reply || typeof reply !== 'string' || reply.trim().length < 1)
      return res.status(400).json({ error: 'Неверные данные' });

    const { data, error } = await supabase
      .from('reviews')
      .update({
        reply_text: reply.trim().slice(0, 800),
        reply_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
