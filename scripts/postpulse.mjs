// ============================================================
// BBN PostPulse Publisher — scripts/postpulse.mjs
// Refreshes OAuth2 token, imports Supabase img_post PNG, and
// schedules posts across Instagram, X, TikTok, Facebook & Threads.
// ============================================================

const DEFAULT_ACCOUNTS = [
  { id: 1757, type: 'INSTAGRAM' },
  { id: 1756, type: 'X_TWITTER' },
  { id: 1758, type: 'TIKTOK' },
  { id: 1759, type: 'FACEBOOK', pageId: '1226176870572281' },
  { id: 1760, type: 'THREADS' },
];

export async function getPostPulseAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch('https://auth.post-pulse.com/oauth/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(`PostPulse OAuth refresh failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token;
}

export async function importPostPulseMedia({ accessToken, imageUrl }) {
  const res = await fetch('https://api.post-pulse.com/v1/media/upload/import', {
    method: 'POST',
    signal: AbortSignal.timeout(25000),
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: imageUrl }),
  });
  const data = await res.json();
  if (!res.ok || !data?.path) {
    throw new Error(`PostPulse media import failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.path;
}

export async function publishToPostPulse({
  accessToken,
  headline,
  summary,
  tag,
  imageUrl,
  delayMinutes = 2,
}) {
  const mediaPath = await importPostPulseMedia({ accessToken, imageUrl });
  const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
  const baseText = `${String(summary || headline || '').trim()}\n\n${String(tag || '').trim()}`.trim();

  const publications = DEFAULT_ACCOUNTS.map((acc) => {
    const platformSettings = { type: acc.type };
    if (acc.pageId) platformSettings.pageId = acc.pageId;
    if (acc.type === 'TIKTOK') platformSettings.title = String(headline || '').slice(0, 90);

    // X/Twitter 280-char safety
    const content = acc.type === 'X_TWITTER' && baseText.length > 275
      ? `${baseText.slice(0, 272)}...`
      : baseText;

    return {
      socialMediaAccountId: acc.id,
      platformSettings,
      posts: [
        {
          content,
          attachmentPaths: [mediaPath],
        },
      ],
    };
  });

  const res = await fetch('https://api.post-pulse.com/v1/posts', {
    method: 'POST',
    signal: AbortSignal.timeout(25000),
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scheduledTime,
      isDraft: false,
      publications,
    }),
  });

  const respText = await res.text();
  if (!res.ok) {
    throw new Error(`PostPulse schedule failed (HTTP ${res.status}): ${respText.slice(0, 250)}`);
  }
  return { mediaPath, scheduledTime };
}
