/**
 * Replaces send-lead.php, send.php and mail.php.
 *
 * PHP mail() does not exist on Vercel. This posts through Resend instead,
 * which also fixes a real deliverability problem: Hostinger's mail() sends
 * as noreply@graphinxt.com from an IP that is not in your SPF record, so a
 * share of those leads have been landing in spam.
 *
 * Setup:
 *   1. resend.com -> add graphinxt.com -> add the DNS records it gives you
 *   2. Vercel -> Settings -> Environment Variables -> RESEND_API_KEY
 *
 * Accepts the same JSON payloads the old endpoints did, so front-end code
 * only needs its URL changed from /send-lead.php to /api/lead.
 */

const TO = [
  'reach@graphinxt.com',
  'graphinxtmarketing@gmail.com',
  'graphinxtwebdevelopments@gmail.com',
  'graphinxt@gmail.com',
];

// Simple in-memory throttle. Resets on cold start; enough to stop casual abuse.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < window);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const pick = (data, keys) => {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
};

const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').slice(0, 500);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Too many requests' });
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  if (!data || typeof data !== 'object') data = {};

  // Honeypot: add <input name="company_website" hidden> to every form.
  // Bots fill it, humans never see it.
  if (pick(data, ['company_website'])) {
    return res.status(200).json({ success: true });
  }

  const name = pick(data, ['from_name', 'name', 'fullName']);
  const email = pick(data, ['from_email', 'email']);
  const service = pick(data, ['service', 'serviceInterest']);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !validEmail) {
    return res
      .status(400)
      .json({ success: false, error: 'Missing or invalid name or email' });
  }

  const skip = new Set(['to_email', 'company_website']);
  const lines = [`Source page: ${pick(data, ['website_url', 'page']) || '-'}`, ''];
  for (const [k, v] of Object.entries(data)) {
    if (skip.has(k)) continue;
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    lines.push(`${k.replace(/_/g, ' ')}: ${val}`);
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ success: false, error: 'Mail not configured' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Graphinxt Website <noreply@graphinxt.com>',
        to: TO,
        reply_to: email,
        subject: `New Lead - ${service || 'Website'} - graphinxt.com`,
        text: lines.map(clean).join('\n'),
      }),
    });

    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ success: false, error: 'Mail dispatch failed' });
    }

    // The homepage contact form is a native <form method="post">, not fetch().
    // Those expect a redirect, exactly like the old send.php did.
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      res.setHeader('Location', '/thank-you');
      return res.status(303).end();
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Mail dispatch failed' });
  }
}
