// Transition definitions shared by the preview (canvas) and the export (WebCodecs / ffmpeg).
// Each transition has a category, bilingual labels, icon, optional badge, and an exact
// HTML5 2D canvas procedural painter so Live Preview and MP4 Export match 1:1.

export const DEFAULT_TRANSITION_DURATION = 0.4;
export const MIN_TRANSITION_DURATION = 0.15;
export const MAX_TRANSITION_DURATION = 1.2;

// Draw an image contained in WxH, optionally zoomed by `scale` about the centre
// so transitions can blend two images at their current Ken Burns zoom.
function paint(ctx, img, W, H, scale = 1) {
  if (!img) return;
  const iw = img.naturalWidth || img.videoWidth || img.displayWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.displayHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(W / iw, H / ih) * scale;
  const w = iw * s;
  const h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export const TRANSITIONS = {
  // ============================================================================
  // 🔥 TRENDING YOUTUBE & SHORTS TRANSITIONS
  // ============================================================================
  whippan_left: {
    label: "Whip Pan Left",
    labelAr: "سحب خاطف لليسار",
    icon: "⇇",
    category: "trend",
    badge: "🔥 TREND",
    xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dx = -W * ease;
      const blurAmt = Math.sin(p * Math.PI) * (W * 0.045);
      if (blurAmt > 2) {
        c.save();
        c.globalAlpha = 0.35;
        c.translate(dx - blurAmt, 0);
        paint(c, f, W, H, sf);
        c.translate(blurAmt * 2, 0);
        paint(c, f, W, H, sf);
        c.restore();
        c.save();
        c.globalAlpha = 0.35;
        c.translate(W + dx - blurAmt, 0);
        paint(c, t, W, H, st);
        c.translate(blurAmt * 2, 0);
        paint(c, t, W, H, st);
        c.restore();
      }
      c.save();
      c.translate(dx, 0);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(W + dx, 0);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  whippan_right: {
    label: "Whip Pan Right",
    labelAr: "سحب خاطف لليمين",
    icon: "⇉",
    category: "trend",
    badge: "🔥 TREND",
    xfade: "slideright",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dx = W * ease;
      const blurAmt = Math.sin(p * Math.PI) * (W * 0.045);
      if (blurAmt > 2) {
        c.save();
        c.globalAlpha = 0.35;
        c.translate(dx - blurAmt, 0);
        paint(c, f, W, H, sf);
        c.translate(blurAmt * 2, 0);
        paint(c, f, W, H, sf);
        c.restore();
        c.save();
        c.globalAlpha = 0.35;
        c.translate(-W + dx - blurAmt, 0);
        paint(c, t, W, H, st);
        c.translate(blurAmt * 2, 0);
        paint(c, t, W, H, st);
        c.restore();
      }
      c.save();
      c.translate(dx, 0);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(-W + dx, 0);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  whippan_up: {
    label: "Whip Pan Up",
    labelAr: "سحب خاطف للأعلى",
    icon: "⇈",
    category: "trend",
    badge: "🔥 SHORTS",
    xfade: "slideup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dy = -H * ease;
      const blurAmt = Math.sin(p * Math.PI) * (H * 0.04);
      if (blurAmt > 2) {
        c.save();
        c.globalAlpha = 0.32;
        c.translate(0, dy - blurAmt);
        paint(c, f, W, H, sf);
        c.translate(0, H + blurAmt * 2);
        paint(c, t, W, H, st);
        c.restore();
      }
      c.save();
      c.translate(0, dy);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(0, H + dy);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  whippan_down: {
    label: "Whip Pan Down",
    labelAr: "سحب خاطف للأسفل",
    icon: "⇊",
    category: "trend",
    badge: "🔥 SHORTS",
    xfade: "slidedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dy = H * ease;
      c.save();
      c.translate(0, dy);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(0, -H + dy);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  hyperzoom: {
    label: "Hyper Zoom In",
    labelAr: "زووم انفجاري للداخل",
    icon: "💥",
    category: "trend",
    badge: "🔥 TREND",
    xfade: "zoomin",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) {
        const pNorm = p * 2;
        paint(c, f, W, H, sf * (1 + Math.pow(pNorm, 2) * 1.55));
      } else {
        const pNorm = (p - 0.5) * 2;
        const scaleEase = 1.85 - Math.sin((pNorm * Math.PI) / 2) * 0.85;
        paint(c, t, W, H, st * scaleEase);
      }
      const bloom = Math.max(0, 1 - Math.abs(p - 0.5) * 4);
      if (bloom > 0) {
        const grad = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 1.7);
        grad.addColorStop(0, `rgba(255, 252, 235, ${bloom * 0.95})`);
        grad.addColorStop(0.35, `rgba(255, 215, 120, ${bloom * 0.65})`);
        grad.addColorStop(1, "rgba(255, 160, 50, 0)");
        c.save();
        c.globalCompositeOperation = "screen";
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  zoomout_punch: {
    label: "Crash Zoom Out",
    labelAr: "زووم ارتدادي للخارج",
    icon: "⊖",
    category: "trend",
    badge: "🔥 TREND",
    xfade: "zoomin",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.48) {
        const pNorm = p / 0.48;
        paint(c, f, W, H, sf * Math.max(0.45, 1 - pNorm * 0.42));
      } else {
        const pNorm = (p - 0.48) / 0.52;
        const ease = 1 + Math.pow(1 - pNorm, 2) * 0.65;
        paint(c, t, W, H, st * ease);
      }
      const flash = Math.max(0, 1 - Math.abs(p - 0.48) * 5);
      if (flash > 0) {
        c.save();
        c.globalAlpha = flash * 0.35;
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  glitch: {
    label: "Glitch RGB Split",
    labelAr: "تشويش رقمي RGB",
    icon: "⚡",
    category: "trend",
    badge: "🔥 TREND",
    xfade: "dissolve",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const isFirst = p < 0.48;
      const baseImg = isFirst ? f : t;
      const scale = isFirst ? sf : st;
      paint(c, baseImg, W, H, scale);

      const glitchAmt = Math.sin(p * Math.PI);
      if (glitchAmt > 0.06) {
        const numSlices = 8;
        const sliceH = H / numSlices;
        for (let i = 0; i < numSlices; i++) {
          if ((i + Math.floor(p * 9)) % 2 === 0) {
            const shift = Math.sin(p * 22 + i * 2.8) * (W * 0.055 * glitchAmt);
            c.save();
            c.beginPath();
            c.rect(0, i * sliceH, W, sliceH);
            c.clip();
            c.translate(shift, 0);
            paint(c, baseImg, W, H, scale);
            c.restore();
          }
        }
        c.save();
        c.globalCompositeOperation = "screen";
        c.globalAlpha = glitchAmt * 0.48;
        c.translate(W * 0.016 * glitchAmt, 0);
        c.fillStyle = "rgba(0, 240, 255, 0.32)";
        c.fillRect(0, 0, W, H);
        c.restore();

        c.save();
        c.globalCompositeOperation = "screen";
        c.globalAlpha = glitchAmt * 0.42;
        c.translate(-W * 0.016 * glitchAmt, 0);
        c.fillStyle = "rgba(255, 0, 100, 0.3)";
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  filmburn: {
    label: "Red Film Burn",
    labelAr: "احتراق الفيلم الوثائقي",
    icon: "🔥",
    category: "trend",
    badge: "🎬 DOC",
    xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, p < 0.52 ? f : t, W, H, p < 0.52 ? sf : st);
      const burn = Math.sin(p * Math.PI);
      if (burn > 0.02) {
        const cx = W * (0.25 + p * 0.5);
        const cy = H * (0.6 - p * 0.25);
        const grad = c.createRadialGradient(cx, cy, W * 0.04, cx, cy, W * 0.78);
        grad.addColorStop(0, `rgba(255, 255, 240, ${burn * 0.96})`);
        grad.addColorStop(0.28, `rgba(255, 140, 20, ${burn * 0.85})`);
        grad.addColorStop(0.62, `rgba(220, 25, 35, ${burn * 0.55})`);
        grad.addColorStop(1, "rgba(120, 0, 0, 0)");
        c.save();
        c.globalCompositeOperation = "screen";
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  lightleak: {
    label: "Light Leak Flare",
    labelAr: "تسريب ضوئي سينمائي",
    icon: "✨",
    category: "cinematic",
    badge: "🎬 DOC",
    xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.globalAlpha = p;
      paint(c, t, W, H, st);
      c.globalAlpha = 1;

      const flare = Math.sin(p * Math.PI);
      if (flare > 0) {
        const sweepX = W * (p * 1.4 - 0.2);
        const grad = c.createRadialGradient(sweepX, H * 0.35, 15, sweepX, H * 0.35, W * 0.7);
        grad.addColorStop(0, `rgba(255, 250, 220, ${flare * 0.92})`);
        grad.addColorStop(0.3, `rgba(255, 160, 50, ${flare * 0.72})`);
        grad.addColorStop(0.65, `rgba(255, 45, 110, ${flare * 0.38})`);
        grad.addColorStop(1, "rgba(255, 0, 80, 0)");

        c.save();
        c.globalCompositeOperation = "screen";
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  filmroll: {
    label: "Film Roll Strip",
    labelAr: "دوران شريط سينمائي",
    icon: "🎞",
    category: "cinematic",
    badge: "🎬 DOC",
    xfade: "slidedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p * p * (3 - 2 * p);
      const barH = H * 0.12;
      const totalDist = H + barH;
      const dy = totalDist * ease;

      c.save();
      c.translate(0, dy);
      paint(c, f, W, H, sf);
      c.restore();

      c.save();
      c.fillStyle = "#0c0d12";
      c.fillRect(0, dy - barH, W, barH);
      c.fillStyle = "rgba(255, 255, 255, 0.16)";
      const holeW = W * 0.04,
        holeH = barH * 0.5;
      for (let x = W * 0.05; x < W; x += W * 0.12) {
        c.fillRect(x, dy - barH + (barH - holeH) / 2, holeW, holeH);
      }
      c.restore();

      c.save();
      c.translate(0, dy - totalDist);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  shutter_slice: {
    label: "Venetian Shutter",
    labelAr: "شرائح فوكس الوثائقية",
    icon: "▤",
    category: "cinematic",
    badge: "🎬 VOX",
    xfade: "wipeleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      const cols = 6;
      const colW = W / cols;
      c.save();
      c.beginPath();
      for (let i = 0; i < cols; i++) {
        const delay = (i / cols) * 0.25;
        const localP = Math.max(0, Math.min(1, (p - delay) / 0.75));
        const ease = localP * localP * (3 - 2 * localP);
        c.rect(i * colW, 0, colW * ease, H);
      }
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  split_reveal: {
    label: "Split Screen Open",
    labelAr: "انقسام سينمائي",
    icon: "⇔",
    category: "cinematic",
    badge: "🎬 DOC",
    xfade: "circleopen",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, t, W, H, st);
      const ease = p * p * (3 - 2 * p);
      const halfH = H / 2;
      const shift = halfH * ease;
      // Top half of outgoing frame moves up
      c.save();
      c.beginPath();
      c.rect(0, 0, W, halfH - shift);
      c.clip();
      c.translate(0, -shift);
      paint(c, f, W, H, sf);
      c.restore();
      // Bottom half of outgoing frame moves down
      c.save();
      c.beginPath();
      c.rect(0, halfH + shift, W, halfH - shift);
      c.clip();
      c.translate(0, shift);
      paint(c, f, W, H, sf);
      c.restore();
    },
  },
  luma_dissolve: {
    label: "Dream Glow Dissolve",
    labelAr: "تلاشي ضوئي ناعم",
    icon: "✦",
    category: "cinematic",
    badge: "🎬 CINEMA",
    xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p * p * (3 - 2 * p);
      paint(c, f, W, H, sf * (1 + ease * 0.05));
      c.save();
      c.globalAlpha = ease;
      paint(c, t, W, H, st * (1.05 - ease * 0.05));
      c.restore();
      const glow = Math.sin(p * Math.PI);
      if (glow > 0.05) {
        c.save();
        c.globalCompositeOperation = "screen";
        c.fillStyle = `rgba(255, 244, 214, ${glow * 0.34})`;
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },

  // ============================================================================
  // ⚡ DYNAMIC & ACTION TRANSITIONS
  // ============================================================================
  spinwarp: {
    label: "Spin Warp",
    labelAr: "دوران حركي خاطف",
    icon: "🔄",
    category: "dynamic",
    badge: "⚡ FAST",
    xfade: "radial",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const isFirst = p < 0.5;
      const angle = isFirst ? p * 2 * (Math.PI / 10) : -((1 - (p - 0.5) * 2) * (Math.PI / 10));
      const scale = isFirst
        ? 1 + Math.pow(p * 2, 2) * 0.38
        : 1 + Math.pow(1 - (p - 0.5) * 2, 2) * 0.38;

      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(angle);
      c.scale(scale, scale);
      c.translate(-W / 2, -H / 2);
      paint(c, isFirst ? f : t, W, H, isFirst ? sf : st);
      c.restore();

      const blur = Math.sin(p * Math.PI);
      if (blur > 0.18) {
        c.save();
        c.globalAlpha = blur * 0.28;
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  smoothslide: {
    label: "Parallax Push",
    labelAr: "انزلاق بارالاكس سلس",
    icon: "⇥",
    category: "dynamic",
    badge: "📐 CLEAN",
    xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = 1 - Math.pow(1 - p, 3);
      const dx = W * (1 - ease);

      c.save();
      c.translate(-W * ease * 0.32, 0);
      paint(c, f, W, H, sf);
      c.fillStyle = `rgba(0, 0, 0, ${ease * 0.35})`;
      c.fillRect(0, 0, W, H);
      c.restore();

      c.save();
      c.translate(dx, 0);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  diagonal_wipe: {
    label: "Diagonal Slash",
    labelAr: "قطع قطري حاد",
    icon: "⟋",
    category: "dynamic",
    badge: "⚡ ACTION",
    xfade: "wipeleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const reach = (W + H * 0.6) * ease;
      c.save();
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(reach, 0);
      c.lineTo(reach - H * 0.55, H);
      c.lineTo(0, H);
      c.closePath();
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
      // Glowing slash edge
      if (p > 0.04 && p < 0.96) {
        c.save();
        c.strokeStyle = "rgba(59, 130, 246, 0.85)";
        c.lineWidth = Math.max(3, W * 0.006);
        c.beginPath();
        c.moveTo(reach, 0);
        c.lineTo(reach - H * 0.55, H);
        c.stroke();
        c.restore();
      }
    },
  },
  diamond_open: {
    label: "Diamond Reveal",
    labelAr: "كشف هندسي ماسي",
    icon: "❖",
    category: "dynamic",
    xfade: "circleopen",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      const ease = p * p * (3 - 2 * p);
      const r = (W + H) * 0.65 * ease;
      const cx = W / 2,
        cy = H / 2;
      c.save();
      c.beginPath();
      c.moveTo(cx, cy - r);
      c.lineTo(cx + r, cy);
      c.lineTo(cx, cy + r);
      c.lineTo(cx - r, cy);
      c.closePath();
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  zoomin: {
    label: "Zoom Punch",
    labelAr: "تقريب حركي",
    icon: "⊕",
    category: "dynamic",
    xfade: "zoomin",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf * (1 + p * 0.45));
      c.globalAlpha = p;
      paint(c, t, W, H, st * (0.75 + 0.25 * p));
      c.globalAlpha = 1;
    },
  },
  flash: {
    label: "Camera Shutter Flash",
    labelAr: "فلاش الكاميرا",
    icon: "📸",
    category: "dynamic",
    xfade: "fadegrays",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, p < 0.45 ? f : t, W, H, p < 0.45 ? sf : st);
      const flashAlpha = Math.max(0, 1 - Math.abs(p - 0.45) * 3.2);
      if (flashAlpha > 0) {
        c.fillStyle = "#fffbeb";
        c.globalAlpha = flashAlpha;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
    },
  },

  // ============================================================================
  // 📐 CLASSIC & BROADCAST TRANSITIONS
  // ============================================================================
  fade: {
    label: "Crossfade",
    labelAr: "تلاشي متقاطع",
    icon: "✕",
    category: "cinematic",
    xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.globalAlpha = p;
      paint(c, t, W, H, st);
      c.globalAlpha = 1;
    },
  },
  fadeblack: {
    label: "Dip to Black",
    labelAr: "تلاشي للأسود",
    icon: "◐",
    category: "cinematic",
    xfade: "fadeblack",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) {
        c.globalAlpha = 1 - 2 * p;
        paint(c, f, W, H, sf);
      } else {
        c.globalAlpha = 2 * p - 1;
        paint(c, t, W, H, st);
      }
      c.globalAlpha = 1;
    },
  },
  fadewhite: {
    label: "Dip to White",
    labelAr: "تلاشي للأبيض",
    icon: "◑",
    category: "cinematic",
    xfade: "fadewhite",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) {
        paint(c, f, W, H, sf);
        c.fillStyle = "#ffffff";
        c.globalAlpha = p * 2;
        c.fillRect(0, 0, W, H);
      } else {
        paint(c, t, W, H, st);
        c.fillStyle = "#ffffff";
        c.globalAlpha = (1 - p) * 2;
        c.fillRect(0, 0, W, H);
      }
      c.globalAlpha = 1;
    },
  },
  slideleft: {
    label: "Slide Left",
    labelAr: "انزلاق لليسار",
    icon: "⇐",
    category: "classic",
    xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save();
      c.translate(-W * p, 0);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(W * (1 - p), 0);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  slideright: {
    label: "Slide Right",
    labelAr: "انزلاق لليمين",
    icon: "⇒",
    category: "classic",
    xfade: "slideright",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save();
      c.translate(W * p, 0);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(-W * (1 - p), 0);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  wipeleft: {
    label: "Wipe Left",
    labelAr: "مسح لليسار",
    icon: "◀",
    category: "classic",
    xfade: "wipeleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save();
      c.beginPath();
      const x = W * (1 - p);
      c.rect(x, 0, W - x, H);
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  wiperight: {
    label: "Wipe Right",
    labelAr: "مسح لليمين",
    icon: "▶",
    category: "classic",
    xfade: "wiperight",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save();
      c.beginPath();
      c.rect(0, 0, W * p, H);
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  circleopen: {
    label: "Iris Circle Open",
    labelAr: "دائرة تتسع",
    icon: "◎",
    category: "classic",
    xfade: "circleopen",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save();
      c.beginPath();
      c.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * p, 0, Math.PI * 2);
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  circleclose: {
    label: "Iris Circle Close",
    labelAr: "دائرة تنغلق",
    icon: "◉",
    category: "classic",
    xfade: "circleclose",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, t, W, H, st);
      c.save();
      c.beginPath();
      c.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * (1 - p), 0, Math.PI * 2);
      c.clip();
      paint(c, f, W, H, sf);
      c.restore();
    },
  },
  wipeup: {
    label: "Wipe Up",
    labelAr: "مسح للأعلى",
    icon: "▲",
    category: "classic",
    xfade: "wipeup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save();
      c.beginPath();
      const y = H * (1 - p);
      c.rect(0, y, W, H - y);
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  wipedown: {
    label: "Wipe Down",
    labelAr: "مسح للأسفل",
    icon: "▼",
    category: "classic",
    xfade: "wipedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save();
      c.beginPath();
      c.rect(0, 0, W, H * p);
      c.clip();
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  slideup: {
    label: "Slide Up",
    labelAr: "انزلاق للأعلى",
    icon: "⇑",
    category: "classic",
    xfade: "slideup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save();
      c.translate(0, -H * p);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(0, H * (1 - p));
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  slidedown: {
    label: "Slide Down",
    labelAr: "انزلاق للأسفل",
    icon: "⇓",
    category: "classic",
    xfade: "slidedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save();
      c.translate(0, H * p);
      paint(c, f, W, H, sf);
      c.restore();
      c.save();
      c.translate(0, -H * (1 - p));
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  cut: {
    label: "Hard Cut (None)",
    labelAr: "قطع مباشر بدون انتقال",
    icon: "⊘",
    category: "classic",
    xfade: null,
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => paint(c, t, W, H, st),
  },
};

export const TRANSITION_LIST = Object.keys(TRANSITIONS).map((id) => ({
  id,
  ...TRANSITIONS[id],
}));

export const TRANSITION_CATEGORIES = [
  { id: "all", label: "All / الكل" },
  { id: "trend", label: "🔥 ترند اليوتيوب (Trending)" },
  { id: "cinematic", label: "🎬 سينمائي ووثائقي (Documentary)" },
  { id: "dynamic", label: "⚡ حركي وسريع (Dynamic)" },
  { id: "classic", label: "📐 كلاسيكي (Classic)" },
];

export const TRENDING_AUTOMATION_PICKS = [
  "whippan_left",
  "hyperzoom",
  "glitch",
  "filmburn",
  "lightleak",
  "whippan_right",
  "shutter_slice",
  "filmroll",
  "spinwarp",
  "smoothslide",
];

export function transitionOf(id) {
  return TRANSITIONS[id] || TRANSITIONS.cut;
}

export function mixTransitions(picks, n, rnd = Math.random) {
  const out = [];
  if (!picks || !picks.length || n <= 0) return out;
  for (let i = 0; i < n; i++) {
    let pool = picks;
    if (picks.length > 1 && i > 0) pool = picks.filter((p) => p !== out[i - 1]);
    out.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return out;
}

export function mixTrendingTransitions(n, rnd = Math.random) {
  return mixTransitions(TRENDING_AUTOMATION_PICKS, n, rnd);
}
