import { transitionOf } from "./transitions";
import { applyEffect } from "./effects";
import {
  captionCueAt,
  drawCaption,
  captionFontPx,
  captionFontFamily,
  drawCaptionOverlay,
} from "./captions";

function makeYield() {
  if (typeof MessageChannel === "undefined") {
    return { tick: () => new Promise((r) => setTimeout(r, 0)), done: () => {} };
  }
  const ch = new MessageChannel();
  const waiters = [];
  ch.port1.onmessage = () => {
    const w = waiters.shift();
    if (w) w();
  };
  return {
    tick: () =>
      new Promise((res) => {
        waiters.push(res);
        ch.port2.postMessage(0);
      }),
    done: () => {
      try {
        ch.port1.close();
        ch.port2.close();
      } catch (_) {}
    },
  };
}

/**
 * Fallback client-side video renderer using HTML5 Canvas captureStream + MediaRecorder.
 * Runs in 100% of modern browsers without requiring WebCodecs hardware encoders.
 */
export async function renderCanvasCapture(
  spec,
  imagesByName,
  onProgress,
  shouldCancel,
  logs = []
) {
  const log = (m) => {
    try {
      logs.push(m);
    } catch (_) {}
  };
  const report = (frac, phase) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, frac)), phase);
  };
  const bail = () => {
    if (shouldCancel && shouldCancel()) {
      const e = new Error("Render cancelled");
      e.cancelled = true;
      throw e;
    }
  };

  const {
    clips,
    width = 1920,
    height = 1080,
    fps = 30,
    transitions = [],
    transitionDuration = 0.4,
    motions = [],
    motionAmount = 0.08,
    audioFile = null,
    videosByName = {},
    trims = [],
    speeds = [],
    volumes = [],
    cues = null,
    captionStyle = "classic",
    captionColor = null,
    captionAnimation = "pop",
    captionSize = "md",
    captionLineHeight = 0,
    captionFontScale = 1,
    captionSingleLine = false,
    captionFont = "default",
    captionPosition = "bottom",
    captionEffects = [],
    captionEffectsOn = true,
    effectId = "none",
    effectIntensity = 0.5,
    effectByName = {},
  } = spec;

  if (!clips || !clips.length) throw new Error("Nothing to render.");

  const W = width;
  const H = height;
  const total = clips[clips.length - 1].start + clips[clips.length - 1].duration;
  const totalFrames = Math.max(1, Math.round(total * fps));

  report(0.01, "Initializing canvas capture engine...");

  // Preload and decode images and video elements
  const loadedBmps = new Map();
  const videoEls = new Map();

  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const imageFile = imagesByName[c.name];
    const videoFile = videosByName[c.name];

    if (imageFile && !loadedBmps.has(c.name)) {
      try {
        if (typeof createImageBitmap !== "undefined") {
          const bmp = await createImageBitmap(imageFile);
          loadedBmps.set(c.name, bmp);
        } else {
          const img = new Image();
          img.src = URL.createObjectURL(imageFile);
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
          });
          loadedBmps.set(c.name, img);
        }
      } catch (e) {
        log(`Failed to decode image ${c.name}: ${e}`);
      }
    } else if (videoFile && !videoEls.has(c.name)) {
      try {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.style.position = "fixed";
        v.style.left = "-9999px";
        v.style.top = "-9999px";
        v.style.width = "1px";
        v.style.height = "1px";
        v.style.opacity = "0.001";
        v.style.pointerEvents = "none";
        if (typeof document !== "undefined" && document.body) {
          document.body.appendChild(v);
        }
        const url = URL.createObjectURL(videoFile);
        v.src = url;
        await new Promise((res) => {
          const done = () => {
            v.removeEventListener("loadeddata", done);
            v.removeEventListener("error", done);
            res();
          };
          v.addEventListener("loadeddata", done);
          v.addEventListener("error", done);
          try {
            v.load();
          } catch (_) {
            done();
          }
        });
        videoEls.set(c.name, { v, url });
      } catch (e) {
        log(`Failed to prepare video element for ${c.name}: ${e}`);
      }
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  // Determine supported MediaRecorder mimeType
  let mimeType = "video/webm";
  if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
    mimeType = "video/mp4;codecs=avc1";
  } else if (MediaRecorder.isTypeSupported("video/mp4")) {
    mimeType = "video/mp4";
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
    mimeType = "video/webm;codecs=vp9,opus";
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
    mimeType = "video/webm;codecs=vp8,opus";
  }

  log(`MediaRecorder mimeType: ${mimeType}`);

  // Setup Web Audio if voiceover exists
  let audioContext = null;
  let audioDest = null;
  let audioSource = null;
  if (audioFile) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        audioDest = audioContext.createMediaStreamDestination();
        const arrayBuf = await audioFile.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuf);
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioDest);
      }
    } catch (e) {
      log(`Audio setup failed: ${e}`);
    }
  }

  const canvasStream = canvas.captureStream(fps);
  if (audioDest && audioDest.stream) {
    const audioTrack = audioDest.stream.getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);
  }

  const chunks = [];
  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      resolve(blob);
    };
    recorder.onerror = (err) => reject(err);
  });

  recorder.start(100);
  if (audioSource) audioSource.start(0);

  // Helper to draw a bitmap or video element cleanly into W x H
  function drawMedia(element, zoom = 1, alpha = 1) {
    if (!element) return;
    const iw = element.videoWidth || element.width || element.naturalWidth || W;
    const ih = element.videoHeight || element.height || element.naturalHeight || H;
    if (!iw || !ih) return;

    const scale = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.globalAlpha = alpha;
    ctx.drawImage(element, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }

  // Calculate motion scale at time t
  function scaleAt(clipIdx, t) {
    const c = clips[clipIdx];
    if (!c || c.duration <= 0) return 1;
    const mode = motions[clipIdx] || "none";
    if (mode === "none") return 1;
    const p = Math.min(1, Math.max(0, (t - c.start) / c.duration));
    const amt = motionAmount || 0.08;
    return mode === "zoomin" ? 1 + amt * p : 1 + amt * (1 - p);
  }

  // Get frame drawable for clip i at time t with timeout guard
  async function getFrame(i, t) {
    if (i < 0 || i >= clips.length) return null;
    const c = clips[i];
    const bmp = loadedBmps.get(c.name);
    if (bmp) return bmp;

    const vEntry = videoEls.get(c.name);
    if (vEntry && vEntry.v) {
      const v = vEntry.v;
      const speed = speeds[i] || 1;
      const trimStart = trims[i] || 0;
      const targetTime = trimStart + Math.max(0, t - c.start) * speed;
      const dur = v.duration || 0;
      const clamped = Math.max(0, Math.min(dur ? dur - 0.02 : 0, targetTime));

      if (dur > 0 && Math.abs(v.currentTime - dur) < 0.08) return v;

      if (Math.abs(v.currentTime - clamped) > 0.05 && v._lastClamped !== clamped) {
        v._lastClamped = clamped;
        await new Promise((res) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            v.removeEventListener("seeked", finish);
            v.removeEventListener("error", finish);
            clearTimeout(timeoutId);
            res();
          };
          const timeoutId = setTimeout(finish, 25);
          v.addEventListener("seeked", finish);
          v.addEventListener("error", finish);
          try {
            v.currentTime = clamped;
          } catch (_) {
            finish();
          }
        });
      }
      return v;
    }
    return null;
  }

  // Render loop with non-blocking yielder
  const yielder = makeYield();
  const capFontPxVal = captionFontPx(H, captionSize, captionFontScale);
  const capFamily = captionFontFamily(captionFont);

  let currentClipIdx = 0;
  let lastReportTime = 0;

  for (let f = 0; f < totalFrames; f++) {
    bail();
    const t = f / fps;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    // Find current clip monotonically (O(1))
    while (currentClipIdx < clips.length - 1 && t >= clips[currentClipIdx].start + clips[currentClipIdx].duration) {
      currentClipIdx++;
    }
    const idx = currentClipIdx;

    const clip = clips[idx];
    const type = idx > 0 ? transitions[idx] || "cut" : "cut";
    const tdur = type === "cut" ? 0 : Math.min(transitionDuration, clip ? clip.duration : 0.4);

    if (idx > 0 && tdur > 0 && clip && t < clip.start + tdur) {
      const p = Math.min(1, Math.max(0, (t - clip.start) / tdur));
      const prevFrame = await getFrame(idx - 1, t);
      const curFrame = await getFrame(idx, t);
      const trObj = transitionOf(type);
      if (trObj && trObj.canvas && prevFrame && curFrame) {
        trObj.canvas(
          ctx,
          prevFrame,
          curFrame,
          p,
          W,
          H,
          scaleAt(idx - 1, t),
          scaleAt(idx, t)
        );
      } else {
        drawMedia(await getFrame(idx, t), scaleAt(idx, t), 1);
      }
    } else {
      drawMedia(await getFrame(idx, t), scaleAt(idx, t), 1);
    }

    // Effect
    const fxOv = clip && effectByName[clip.name];
    applyEffect(
      ctx,
      fxOv ? fxOv.id : effectId,
      fxOv ? fxOv.intensity : effectIntensity,
      W,
      H,
      t
    );

    // Captions
    if (cues && cues.length) {
      const cue = captionCueAt ? captionCueAt(cues, t) : null;
      if (cue) {
        drawCaption(
          ctx,
          cue.text,
          W,
          H,
          captionStyle,
          capFontPxVal,
          captionLineHeight,
          capFamily,
          captionPosition,
          {
            color: captionColor,
            animation: captionAnimation,
            t,
            start: cue.start,
            end: cue.end,
            singleLine: !!captionSingleLine,
          }
        );
      }
    }

    // Overlay captions
    if (captionEffectsOn !== false && captionEffects && captionEffects.length) {
      const sceneCtx = { aspect: W < H ? "9:16" : "16:9" };
      for (const ov of captionEffects) {
        if (ov.approved !== false && t >= ov.start && t < ov.end) {
          drawCaptionOverlay(ctx, ov, W, H, t, capFamily, sceneCtx);
        }
      }
    }

    const isLastFrame = f === totalFrames - 1;
    const now = performance.now();
    if (now - lastReportTime >= 120 || isLastFrame) {
      lastReportTime = now;
      const progressFrac = 0.05 + 0.9 * ((f + 1) / totalFrames);
      report(
        progressFrac,
        `Rendering frame ${f + 1}/${totalFrames} (${Math.round(progressFrac * 100)}%)`
      );
      await yielder.tick();
    }
  }

  yielder.done();
  report(0.98, "Finalizing video container...");
  recorder.stop();

  if (audioSource) {
    try {
      audioSource.stop();
    } catch (_) {}
  }
  if (audioContext) {
    try {
      await audioContext.close();
    } catch (_) {}
  }

  // Cleanup object URLs and DOM elements
  for (const { v, url } of videoEls.values()) {
    if (v) {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
        if (v.parentNode) v.parentNode.removeChild(v);
      } catch (_) {}
    }
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
  }

  const finalBlob = await recordingPromise;
  report(1.0, "Export complete (100%)");
  return finalBlob;
}
