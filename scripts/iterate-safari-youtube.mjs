#!/usr/bin/env node

/**
 * Safari YouTube Hover Iterator
 * Runs Safari in offscreen window (no focus steal), navigates to YouTube,
 * dismisses consent dialogs, hovers over video thumbnail/card,
 * and polls DOM computed filters, reveal attributes, and video status.
 */

const DRIVER_URL = 'http://localhost:4444';

async function send(path, method = 'POST', body = null) {
  const res = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function run() {
  console.log('1. Launching Safari session via safaridriver...');
  const sessionData = await send('/session', 'POST', {
    capabilities: {
      alwaysMatch: {
        browserName: 'safari',
      },
    },
  });

  const sessionId = sessionData.value?.sessionId;
  if (!sessionId) {
    throw new Error(`Failed to create session: ${JSON.stringify(sessionData)}`);
  }
  console.log(`Session created: ${sessionId}`);

  try {
    // Move window offscreen so it does not steal focus or obstruct work
    console.log('2. Positioning Safari window offscreen (-2500, -2500)...');
    await send(`/session/${sessionId}/window/rect`, 'POST', {
      x: -2500,
      y: -2500,
      width: 1280,
      height: 800,
    });

    const targetUrl = 'https://www.youtube.com/results?search_query=nature';
    console.log(`3. Navigating to ${targetUrl} ...`);
    await send(`/session/${sessionId}/url`, 'POST', { url: targetUrl });

    console.log('4. Waiting for YouTube DOM and dismissing consent overlays...');
    await new Promise((r) => setTimeout(r, 3000));

    // Dismiss consent bumps
    await send(`/session/${sessionId}/execute/sync`, 'POST', {
      script: `
        document.querySelectorAll("tp-yt-paper-dialog, ytd-consent-bump-v2-lightbox, ytd-consent-bump-v-view-model, tp-yt-iron-overlay-backdrop").forEach(el => el.remove());
      `,
      args: [],
    });

    await new Promise((r) => setTimeout(r, 1000));

    let targetInfo = null;
    for (let i = 0; i < 20; i++) {
      const res = await send(`/session/${sessionId}/execute/sync`, 'POST', {
        script: `
          const card = document.querySelector('ytd-video-renderer ytd-thumbnail, ytd-rich-item-renderer ytd-thumbnail');
          if (!card) return { found: false };
          const img = card.querySelector('img') || card;
          const rect = img.getBoundingClientRect();
          if (rect.width > 80 && rect.height > 50 && rect.top > 50 && rect.bottom < window.innerHeight) {
            return {
              found: true,
              width: rect.width,
              height: rect.height,
              left: rect.left,
              top: rect.top,
              revealed: img.getAttribute('data-comfort-revealed'),
              filter: window.getComputedStyle(img).filter
            };
          }
          return { found: false };
        `,
        args: [],
      });

      if (res.value && res.value.found) {
        targetInfo = res.value;
        console.log(`Found active thumbnail card:`, targetInfo);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!targetInfo) {
      console.warn('Could not locate settled thumbnail.');
      return;
    }

    const targetX = Math.round(targetInfo.left + targetInfo.width / 2);
    const targetY = Math.round(targetInfo.top + targetInfo.height / 2);

    console.log(`5. Dispatching hover actions over (${targetX}, ${targetY})...`);

    // 1. Send W3C pointer move
    await send(`/session/${sessionId}/actions`, 'POST', {
      actions: [
        {
          type: 'pointer',
          id: 'mouse1',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', duration: 100, x: targetX, y: targetY },
          ],
        },
      ],
    });

    // 2. Dispatch DOM pointer events directly to element under point
    await send(`/session/${sessionId}/execute/sync`, 'POST', {
      script: `
        const x = ${targetX};
        const y = ${targetY};
        const el = document.elementFromPoint(x, y);
        if (el) {
          el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }));
        }
        return el ? el.tagName : null;
      `,
      args: [],
    });

    console.log('6. Observing hover transition and media reveal for 5 seconds...');
    for (let t = 1; t <= 5; t++) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollStatus = await send(`/session/${sessionId}/execute/sync`, 'POST', {
        script: `
          const x = ${targetX};
          const y = ${targetY};
          const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y).map(el => ({
            tag: el.tagName,
            id: el.id,
            className: (el.className && typeof el.className === "string") ? el.className.slice(0, 30) : "",
            revealed: el.getAttribute ? el.getAttribute("data-comfort-revealed") : null,
            filter: window.getComputedStyle(el).filter
          })) : [];

          const previewVideo = document.querySelector("#preview video, ytd-video-preview video, #inline-preview-player video, .html5-main-video");
          let videoInfo = null;
          if (previewVideo) {
            const vcs = window.getComputedStyle(previewVideo);
            videoInfo = {
              revealed: previewVideo.getAttribute("data-comfort-revealed"),
              filter: vcs.filter,
              paused: previewVideo.paused,
              currentTime: previewVideo.currentTime
            };
          }

          const thumb = document.querySelector("ytd-thumbnail img, #thumbnail img, yt-image img");
          let thumbInfo = null;
          if (thumb) {
            thumbInfo = {
              revealed: thumb.getAttribute("data-comfort-revealed"),
              filter: window.getComputedStyle(thumb).filter
            };
          }

          return {
            timeSec: ${t},
            stack: stack.slice(0, 6),
            video: videoInfo,
            thumb: thumbInfo
          };
        `,
        args: [],
      });

      console.log(`[+${t}s]`, JSON.stringify(pollStatus.value, null, 2));
    }

    console.log('7. Iterator test completed successfully.');
  } finally {
    console.log('8. Closing Safari session...');
    await send(`/session/${sessionId}`, 'DELETE');
    console.log('Safari session closed.');
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
