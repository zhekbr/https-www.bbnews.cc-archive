// ============================================================
// BBN Image Generator — scripts/generate-image.mjs
// Renders 1200x1200 PNG cards using pre-installed Chrome + puppeteer-core
// and uploads directly to Supabase Storage bucket `img_post`.
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import { buildImageHtml } from './image-template.mjs';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
  'from', 'by', 'in', 'of', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'with', 'after', 'amid', 'over', 'into', 'new', 'says', 'raises', 'hits',
]);

function detectChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function extractPexelsQuery(headline) {
  const words = String(headline || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words.slice(0, 2).join(' ') || 'bitcoin finance';
}

export async function searchPexelsImage(headline, pexelsApiKey) {
  if (!pexelsApiKey) return '';
  const queries = [extractPexelsQuery(headline), 'bitcoin finance news'];

  for (const q of queries) {
    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=3`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'Authorization': pexelsApiKey,
          'User-Agent': 'BBN-ImageBot/1.0 (+https://bbnews.cc)',
        },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const photo = json?.photos?.[0]?.src?.large2x || json?.photos?.[0]?.src?.original;
      if (photo) return photo;
    } catch (err) {
      console.warn(`[Pexels] Search failed for "${q}": ${err.message}`);
    }
  }
  return '';
}

export async function createImageRenderer() {
  const executablePath = detectChromeExecutable();
  if (!executablePath) {
    console.warn('[Image] Chrome/Chromium not found; skipping image generation.');
    return null;
  }

  let puppeteer;
  try {
    const mod = await import('puppeteer-core');
    puppeteer = mod.default || mod;
  } catch {
    console.warn('[Image] puppeteer-core not installed; skipping image generation.');
    return null;
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1200,1200',
    ],
  });

  return {
    async render({ title, subline = 'bbnews.cc', imgUrl }) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1 });
        const cleanTitle = String(title || '').replace(/\*\*/g, '').trim();
        const html = buildImageHtml({ title: cleanTitle, subline, img_url: imgUrl });
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForFunction(() => window.__BBN_READY__ === true, { timeout: 10000 });
        const canvasEl = await page.$('.canvas');
        if (!canvasEl) throw new Error('Element .canvas not found');
        const buffer = await canvasEl.screenshot({ type: 'png' });
        const hash = crypto.randomBytes(8).toString('hex');
        const filename = `bbn-${Date.now()}-${hash}.png`;
        return { buffer, filename };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

export async function uploadImageToSupabase({ buffer, filename, supabaseUrl, serviceRoleKey, bucket = 'img_post' }) {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const uploadUrl = `${cleanUrl}/storage/v1/object/${bucket}/${filename}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'image/png',
    },
    body: buffer,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase Storage upload failed (HTTP ${res.status}): ${errText}`);
  }
  return `${cleanUrl}/storage/v1/object/public/${bucket}/${filename}`;
}
