// ============================================================
// BBN Image Generator — scripts/image-template.mjs
// Supports 1080x1080 (Feed/X/Threads/FB) and 1080x1920 (Reels/TikTok 9:16)
// Safe-zone aligned so Instagram 4:5 grid NEVER crops the headline!
// ============================================================

export function buildImageHtml({ title, subline, img_url, width = 1080, height = 1080 }) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const safeImgUrl = /^https?:\/\//i.test(String(img_url || '').trim())
    ? String(img_url).trim()
    : '';

  const isVertical = height > width;
  // In 1080x1920 vertical Reels, Instagram crops the profile grid to center 1080x1350 (285px off top & bottom).
  // Keeping text well inside top>=320px, bottom>=420px, left/right>=90px guarantees ZERO cropping on grid AND Reels!
  const contentPad = isVertical ? '320px 96px 430px 96px' : '64px 72px';
  const badgeTop = isVertical ? '310px' : '48px';
  const badgeLeft = isVertical ? '96px' : '64px';
  const sideBarBottom = isVertical ? '430px' : '64px';
  const sideBarLeft = isVertical ? '96px' : '64px';
  const watermarkBottom = isVertical ? '436px' : '72px';
  const watermarkLeft = isVertical ? '118px' : '86px';
  const titleBoxHeight = isVertical ? '460px' : '400px';
  const maxFont = isVertical ? 60 : 50;
  const minFont = isVertical ? 28 : 24;

  return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}" />
  <title>BBN Post Generator</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700;900&display=swap"
    rel="stylesheet"
  />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #000;
    }

    .canvas {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
      background: #111;
    }

    .bg-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }

    /* Strong high-contrast bottom scrim so white uppercase text always pops on mobile */
    .overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.96) 0%,
        rgba(0, 0, 0, 0.88) 38%,
        rgba(0, 0, 0, 0.45) 65%,
        rgba(0, 0, 0, 0.22) 100%
      );
    }

    .content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-end;
      padding: ${contentPad};
    }

    .badge {
      position: absolute;
      top: ${badgeTop};
      left: ${badgeLeft};
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .badge-logo {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #F7931A;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 21px;
      color: #fff;
      letter-spacing: 1px;
      flex-shrink: 0;
    }

    .badge-text {
      font-family: 'Inter', sans-serif;
      font-weight: 900;
      font-size: 14px;
      color: #fff;
      letter-spacing: 2px;
      text-transform: uppercase;
      line-height: 1.3;
      opacity: 0.95;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85);
    }

    .badge-text span {
      display: block;
      font-weight: 400;
      font-size: 11px;
      letter-spacing: 3px;
      opacity: 0.8;
    }

    .title-box {
      height: ${titleBoxHeight};
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      overflow: hidden;
      white-space: normal;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .title-text {
      font-family: 'Bebas Neue', sans-serif;
      font-size: ${maxFont}px;
      line-height: 1.15;
      color: #ffffff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      text-align: right;
      text-wrap: balance;
      text-shadow: 0 3px 12px rgba(0, 0, 0, 0.95);
      padding-bottom: 14px;
      padding-left: 12px;
      padding-right: 4px;
      word-break: normal;
      overflow-wrap: break-word;
      white-space: normal;
      display: block;
      width: 100%;
      margin: 0;
    }

    .separator {
      width: 100%;
      height: 4px;
      background: #F7931A;
      margin: 16px 0 16px;
      border-radius: 2px;
    }

    .subline-text {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 20px;
      color: #F7931A;
      letter-spacing: 5px;
      text-transform: uppercase;
      text-align: right;
    }

    .side-bar {
      position: absolute;
      left: ${sideBarLeft};
      bottom: ${sideBarBottom};
      width: 5px;
      height: 76px;
      background: #F7931A;
      border-radius: 2px;
    }

    .watermark {
      position: absolute;
      bottom: ${watermarkBottom};
      left: ${watermarkLeft};
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: rgba(255,255,255,0.65);
      letter-spacing: 2px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="canvas" id="canvas">
    ${safeImgUrl ? `<img class="bg-image" src="${esc(safeImgUrl)}" alt="" crossorigin="anonymous" />` : ''}
    <div class="overlay"></div>

    <div class="badge">
      <div class="badge-logo">BBN</div>
      <div class="badge-text">
        Bitcoin Brasil News
        <span>bbnews.cc</span>
      </div>
    </div>

    <div class="side-bar"></div>
    <div class="watermark">bbnews.cc</div>

    <div class="content">
      <div class="title-box" id="titleBox">
        <span class="title-text" id="titleText">${esc(title)}</span>
      </div>
      <div class="separator"></div>
      <div class="subline-text">${esc(subline) || '&#160;'}</div>
    </div>
  </div>

  <script>
    window.__BBN_READY__ = false;

    window.onload = function () {
      const box  = document.getElementById('titleBox');
      const text = document.getElementById('titleText');

      const MAX_SIZE = ${maxFont};
      const MIN_SIZE = ${minFont};

      let currentSize = MAX_SIZE;
      text.style.fontSize = currentSize + 'px';

      // Fit cleanly inside BOTH height and width with safety margin so no letter is ever clipped
      while (
        (text.scrollHeight > box.clientHeight - 8 ||
         text.scrollWidth  > box.clientWidth - 4) &&
        currentSize > MIN_SIZE
      ) {
        currentSize -= 1;
        text.style.fontSize = currentSize + 'px';
      }

      const sideBar = document.querySelector('.side-bar');
      if (sideBar) {
        sideBar.style.height = Math.min(text.scrollHeight * 0.45, 160) + 'px';
      }

      window.__BBN_READY__ = true;
    };
  </script>
</body>
</html>`;
}
