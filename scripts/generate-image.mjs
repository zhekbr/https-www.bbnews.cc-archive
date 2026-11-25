// ============================================================
// BBN Image Generator — scripts/generate-image.mjs
// Smart visual search (Wikimedia Commons anti-logo filter -> Pexels fallback)
// + 1200x1200 PNG rendering using pre-installed Chrome + puppeteer-core
// + Upload to Supabase Storage bucket `img_post`.
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { buildImageHtml } from './image-template.mjs';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
  'from', 'by', 'in', 'of', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'with', 'after', 'amid', 'over', 'into', 'new', 'says', 'raises', 'hits',
]);

// Reject logos, flags, maps, diagrams, icons, coats of arms, watermarks
const WIKIMEDIA_BLOCKED_RE =
  /(logo|flag|map|coat[\s_-]of[\s_-]arms|seal|emblem|icon|banner|diagram|chart|signature|stamp|crest|badge|symbol|locator|outline|blank|vector|watermark|screenshot|headline|newspaper|cover|poster)/i;

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
  return words.slice(0, 3).join(' ') || 'bitcoin finance';
}

export async function searchWikimediaImage(query) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return '';

  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${cleanQuery} filetype:bitmap`,
      gsrlimit: '12',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: '1600',
      format: 'json',
    });

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'BBN-NewsBot/1.0 (https://bbnews.cc; contact@bbnews.cc)',
      },
    });
    if (!res.ok) return '';

    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    const queryWords = cleanQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    const candidates = [];
    for (const page of pages) {
      const title = String(page?.title || '');
      const titleLower = title.toLowerCase();
      const info = page?.imageinfo?.[0];
      if (!info) continue;

      const mime = String(info.mime || '').toLowerCase();
      if (mime !== 'image/jpeg' && mime !== 'image/png') continue;

      const width = Number(info.width) || 0;
      const height = Number(info.height) || 0;
      if (width < 800 || height < 500) continue;

      const ratio = width / height;
      if (ratio < 0.55 || ratio > 2.4) continue;

      const url = info.thumburl || info.url || '';
      if (!/^https?:\/\//i.test(url)) continue;

      if (WIKIMEDIA_BLOCKED_RE.test(title) || WIKIMEDIA_BLOCKED_RE.test(url)) continue;

      // Require the primary subject keyword to appear in the filename/title so we never pick unrelated matches
      const matchedWords = queryWords.filter((w) => titleLower.includes(w));
      if (queryWords.length > 0 && !titleLower.includes(queryWords[0])) continue;

      // Prefer exact subject matches + JPEG real photos + higher resolution
      const rank =
        matchedWords.length * 25 +
        (mime === 'image/jpeg' ? 10 : 0) +
        (width >= 1200 ? 5 : 0) -
        Math.abs(ratio - 1.33);
      candidates.push({ url, rank, title });
    }

    candidates.sort((a, b) => b.rank - a.rank);
    if (candidates[0]) {
      console.log(`🌐 [Wikimedia] Selected photo for "${cleanQuery}": ${candidates[0].title}`);
      return candidates[0].url;
    }
  } catch (err) {
    console.warn(`[Wikimedia] Search failed for "${cleanQuery}": ${err.message}`);
  }
  return '';
}

export async function searchPexelsImage(queryOrHeadline, pexelsApiKey) {
  if (!pexelsApiKey) return '';
  const queries = [
    String(queryOrHeadline || '').trim(),
    extractPexelsQuery(queryOrHeadline),
    'bitcoin finance news',
  ].filter(Boolean);

  const tried = new Set();
  for (const q of queries) {
    if (tried.has(q.toLowerCase())) continue;
    tried.add(q.toLowerCase());

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
      if (photo) {
        console.log(`📷 [Pexels] Selected photo for "${q}"`);
        return photo;
      }
    } catch (err) {
      console.warn(`[Pexels] Search failed for "${q}": ${err.message}`);
    }
  }
  return '';
}

export async function findBestBackgroundImage({ headline, wikimediaQuery, pexelsQuery, pexelsApiKey }) {
  // 1. Try Wikimedia Commons first (real editorial photos of places/people/events, no news portal logos)
  if (wikimediaQuery) {
    const wikiUrl = await searchWikimediaImage(wikimediaQuery);
    if (wikiUrl) return wikiUrl;
  }

  // 2. Fallback to Pexels (clean high-res stock photography, zero watermarks)
  const pexelsUrl = await searchPexelsImage(pexelsQuery || headline, pexelsApiKey);
  if (pexelsUrl) return pexelsUrl;

  // 3. Last-resort Wikimedia fallback using extracted keywords if Pexels key is absent
  if (!pexelsApiKey && headline) {
    return await searchWikimediaImage(extractPexelsQuery(headline));
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
      '--window-size=1080,1080',
    ],
  });

  return {
    async render({ title, subline = 'bbnews.cc', imgUrl, width = 1080, height = 1080 }) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        const cleanTitle = String(title || '').replace(/\*\*/g, '').trim();
        const html = buildImageHtml({ title: cleanTitle, subline, img_url: imgUrl, width, height });
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForFunction(() => window.__BBN_READY__ === true, { timeout: 10000 });
        const canvasEl = await page.$('.canvas');
        if (!canvasEl) throw new Error('Element .canvas not found');
        const buffer = await canvasEl.screenshot({ type: 'png' });
        const hash = crypto.randomBytes(8).toString('hex');
        const suffix = height > width ? 'reel' : 'post';
        const filename = `bbn-${suffix}-${Date.now()}-${hash}.png`;
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

export async function renderPngToReelMp4({ pngBuffer, durationSec = 7 }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbn-reel-'));
  const inPng = path.join(tmpDir, 'frame.png');
  const outMp4 = path.join(tmpDir, 'reel.mp4');

  try {
    fs.writeFileSync(inPng, pngBuffer);
    // Crisp static 1080x1920 vertical MP4 + silent AAC audio (required by IG Reels)
    const args = [
      '-y',
      '-loop', '1',
      '-framerate', '30',
      '-i', inPng,
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-t', String(durationSec),
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outMp4,
    ];

    await new Promise((resolve, reject) => {
      execFile('ffmpeg', args, { timeout: 60000, maxBuffer: 5 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) return reject(new Error(`ffmpeg failed: ${err.message} ${String(stderr || '').slice(-200)}`));
        resolve();
      });
    });

    const buffer = fs.readFileSync(outMp4);
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `bbn-reel-${Date.now()}-${hash}.mp4`;
    return { buffer, filename };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function uploadImageToSupabase({
  buffer,
  filename,
  supabaseUrl,
  serviceRoleKey,
  bucket = 'img_post',
  contentType = 'image/png',
}) {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const uploadUrl = `${cleanUrl}/storage/v1/object/${bucket}/${filename}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase Storage upload failed (HTTP ${res.status}): ${errText}`);
  }
  return `${cleanUrl}/storage/v1/object/public/${bucket}/${filename}`;
}
