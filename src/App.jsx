"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";
import { parseTimestampName, analyzeUploadedMediaBatch } from "./lib/timestamp";
import { buildTimeline, trimClips, LEAD_IN } from "./lib/timeline";
import { resolveDimensions, capTo720 } from "./lib/dimensions";
import { getAudioDuration, processAudioFile } from "./lib/audio";
import { getWaveformPeaks } from "./lib/waveform";
import { renderVideo, cancelRender, getActiveRender, reconnectRender, probeBackend } from "./lib/serverRender";
import { renderWebCodecs, webCodecsCanRender, pickRenderProfile, startKeepAwake } from "./lib/webcodecsRender";
import { renderCanvasCapture } from "./lib/canvasCaptureRender";
import { DEFAULT_TRANSITION_DURATION, mixTransitions } from "./lib/transitions";
import { parseTranscript, captionPosPct } from "./lib/captions";
import { makeSfx } from "./lib/sfx";
import Editor from "./components/Editor";
import ChannelsView from "./components/ChannelsView";
import { DialogHost, showAlert } from "./components/Dialog";
import ExportModal from "./components/ExportModal";
import {
  requestPersist,
  newId,
  getGlobalSettings,
  saveGlobalSettings,
  ensureFirestoreSettingsSeeded,
} from "./lib/projectStore";
import {
  createDefaultGlobalSettings,
  formatFilenameTimestamp,
  formatDurationClock,
} from "./lib/narrativeModel";
import {
  Film,
  Tv,
  Upload,
  Volume2,
  FileText,
  Zap,
  Sparkles,
  Sun,
  Moon,
  Globe,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
  CheckCircle2,
  FilePlus2,
  Monitor,
  Smartphone,
  X,
} from "lucide-react";

function loadImageEl(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { img.url = url; img.fileName = file.name; resolve(img); };
    img.src = url;
  });
}

function loadVideoEl(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (posterSrc, w, h, dur) => {
      const img = new Image();
      img.onload = () => {
        img.url = posterSrc; img.fileName = file.name;
        img.isVideo = true; img.videoUrl = url; img.videoDuration = dur || 0;
        img.mediaWidth = w || 1280; img.mediaHeight = h || 720;
        resolve(img);
      };
      img.onerror = () => {
        img.url = null; img.fileName = file.name; img.isVideo = true;
        img.videoUrl = url; img.videoDuration = dur || 0;
        img.mediaWidth = w || 1280; img.mediaHeight = h || 720;
        resolve(img);
      };
      img.src = posterSrc || url;
    };
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
    v.onloadeddata = () => {
      const grab = () => {
        try {
          const c = document.createElement("canvas");
          c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          finish(c.toDataURL("image/jpeg", 0.82), c.width, c.height, v.duration);
        } catch { finish(null, v.videoWidth, v.videoHeight, v.duration); }
      };
      v.onseeked = grab;
      try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { grab(); }
    };
    v.onerror = () => finish(null, 0, 0, 0);
  });
}

// Create a silent WAV File of a given duration when the Editor opens before a voiceover is uploaded
function createSilentWavFile(durationSec = 30) {
  const dur = Math.max(2, Math.min(1800, Math.round(durationSec || 30)));
  const sampleRate = 8000;
  const numSamples = dur * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  return new File([buffer], "timeline_guide_track.wav", { type: "audio/wav" });
}

// Create a styled Broadcast Studio scene placeholder image File when the Editor initially opens
function createSceneCardFile(scene, width = 1280, height = 720) {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#090b10");
    grad.addColorStop(0.55, "#111622");
    grad.addColorStop(1, "#0b0f19");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle studio safe-area frame
    ctx.strokeStyle = "rgba(59, 130, 246, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 48, width - 96, height - 96);

    // Corner broadcast reticle ticks
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 4;
    const tick = 24;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(48, 48 + tick);
    ctx.lineTo(48, 48);
    ctx.lineTo(48 + tick, 48);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(width - 48 - tick, 48);
    ctx.lineTo(width - 48, 48);
    ctx.lineTo(width - 48, 48 + tick);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(48, height - 48 - tick);
    ctx.lineTo(48, height - 48);
    ctx.lineTo(48 + tick, height - 48);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(width - 48 - tick, height - 48);
    ctx.lineTo(width - 48, height - 48);
    ctx.lineTo(width - 48, height - 48 - tick);
    ctx.stroke();

    // Scene badge
    ctx.fillStyle = "rgba(59, 130, 246, 0.16)";
    ctx.fillRect(88, 92, 210, 44);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(88, 92, 210, 44);

    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 22px monospace";
    ctx.fillText(`SCENE 0${scene.sceneNumber || 1} · V1`, 108, 121);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 34px sans-serif";
    const desc = String(scene.visualDescription || "AutoEditor Pro — Broadcast NLE Ready").slice(0, 82);
    ctx.fillText(desc, 88, 198);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "21px sans-serif";
    const excerpt = String(
      scene.scriptExcerpt ||
        "Import voiceover audio, scene plates (images/video), or click Load Demo Project in the ingest bar."
    ).slice(0, 108);
    ctx.fillText(excerpt, 88, 248);

    const tsName = `${formatFilenameTimestamp(scene.startTime || 0)}.png`;
    c.toBlob((blob) => {
      const f = new File([blob || new Blob()], tsName, { type: "image/png" });
      f.isStarterPlaceholder = true;
      resolve(f);
    }, "image/png");
  });
}

function useHistory(initial) {
  const [hist, setHist] = useState({ past: [], present: initial, future: [] });
  const commit = useCallback((updater) => {
    setHist((h) => {
      const next = typeof updater === "function" ? updater(h.present) : updater;
      if (next === h.present) return h;
      const past = h.past.length >= 50 ? h.past.slice(h.past.length - 49) : h.past;
      return { past: [...past, h.present], present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => setHist((h) => {
    if (!h.past.length) return h;
    const prev = h.past[h.past.length - 1];
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  }), []);
  const redo = useCallback(() => setHist((h) => {
    if (!h.future.length) return h;
    const nxt = h.future[0];
    return { past: [...h.past, h.present], present: nxt, future: h.future.slice(1) };
  }), []);
  const reset = useCallback((present) => setHist({ past: [], present, future: [] }), []);
  return [
    hist.present, commit,
    { undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, reset },
  ];
}

export default function App() {
  const [activePortal, setActivePortal] = useState("editor"); // "editor" | "channels"
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [peaks, setPeaks] = useState([]);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_theme") || "dark";
    }
    return "dark";
  });
  const [uiLang, setUiLang] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_ui_lang") || "ar";
    }
    return "ar";
  });
  const isAr = uiLang === "ar";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("app_theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("app_ui_lang", uiLang);
    }
  }, [uiLang]);

  const [globalSettings, setGlobalSettings] = useState(() => createDefaultGlobalSettings());
  const [selectedChannelId, setSelectedChannelId] = useState(
    () => globalSettings?.defaultChannelId || globalSettings?.channels?.[0]?.id || "channel_default_1"
  );
  const [appliedToast, setAppliedToast] = useState(null);
  const [projectCounter, setProjectCounter] = useState(1);
  const [projectTitle, setProjectTitle] = useState("Video Project #1");
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({
    title: "",
    channelId: "",
    aspectRatio: "16:9",
    durationSec: 30,
  });

  const channels = useMemo(() => globalSettings?.channels || [], [globalSettings]);
  const activeChannel = useMemo(
    () =>
      channels.find((c) => c.id === selectedChannelId) ||
      channels.find((c) => c.id === globalSettings?.defaultChannelId) ||
      channels[0] ||
      null,
    [channels, selectedChannelId, globalSettings?.defaultChannelId]
  );

  const [aspect, setAspect] = useState("16:9");
  const [fps, setFps] = useState(30);
  const [renderQuality, setRenderQuality] = useState("full");
  const [transitionDuration, setTransitionDuration] = useState(DEFAULT_TRANSITION_DURATION);
  const [fadeIn, setFadeIn] = useState(0.5);
  const [fadeOut, setFadeOut] = useState(0.6);
  const [motionAmount, setMotionAmount] = useState(0.08);
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [captionRaw, setCaptionRaw] = useState(null);
  const [captionName, setCaptionName] = useState(null);
  const [sfxUploads, setSfxUploads] = useState([]);
  const [selectedSound, setSelectedSound] = useState(null);
  const [importing, setImporting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outUrl, setOutUrl] = useState(null);
  const [error, setError] = useState(null);
  const [editorTab, setEditorTab] = useState("captions");
  const idRef = useRef(0);
  const nextId = () => `s${idRef.current++}`;

  const [doc, commitDoc, { undo, redo, canUndo, canRedo, reset: resetDoc }] =
    useHistory({
      slots: [],
      transitionsByName: {},
      motionByName: {},
      trimByName: {},
      volumeByName: {},
      fitByName: {},
      speedByName: {},
      effectByName: {},
      sfx: [],
      effectId: "cinema",
      effectIntensity: 0.5,
      captionStyle: "hormozi",
      captionColor: "#FFE600",
      captionAnimation: "spring_bounce",
      captionFont: "montserrat",
      captionSize: "lg",
      captionPosition: 25,
      captionLineHeight: null,
      captionFontScale: null,
      captionSingleLine: true,
      captionsOn: true,
      captionEffects: [],
      captionEffectsOn: true,
    });
  const {
    slots = [],
    transitionsByName = {},
    motionByName = {},
    trimByName = {},
    volumeByName = {},
    fitByName = {},
    speedByName = {},
    effectByName = {},
    sfx = [],
    effectId = "none",
    effectIntensity = 0.5,
    captionStyle = "classic",
    captionColor = "#FFFFFF",
    captionAnimation = "typewriter",
    captionFont = "default",
    captionSize = "md",
    captionPosition = 0,
    captionLineHeight = null,
    captionFontScale = null,
    captionSingleLine = false,
    captionsOn = false,
    captionEffects = [],
    captionEffectsOn = true,
  } = doc;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
    setAppliedToast(isAr ? "تم التراجع عن آخر عملية (Ctrl+Z) ↺" : "Undid action (Ctrl+Z) ↺");
    setTimeout(() => setAppliedToast(null), 2000);
  }, [canUndo, undo, isAr]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
    setAppliedToast(isAr ? "تمت إعادة العملية (Ctrl+Y) ↻" : "Redid action (Ctrl+Y) ↻");
    setTimeout(() => setAppliedToast(null), 2000);
  }, [canRedo, redo, isAr]);

  // Global Undo / Redo keyboard shortcuts (Ctrl+Z, Cmd+Z, Ctrl+Y, Cmd+Y, Ctrl+Shift+Z, Cmd+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      const isMac = typeof navigator !== "undefined" && navigator.platform?.toUpperCase()?.includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod) {
        if (e.key === "z" || e.key === "Z" || e.key === "ئ") {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key === "y" || e.key === "Y" || e.key === "غ") {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  const setEffectId = useCallback((id) => {
    commitDoc((d) => ({ ...d, effectId: id }));
  }, [commitDoc]);
  const setEffectIntensity = useCallback((intensity) => {
    commitDoc((d) => ({ ...d, effectIntensity: intensity }));
  }, [commitDoc]);
  const setCaptionStyle = useCallback((style) => {
    commitDoc((d) => ({ ...d, captionStyle: style }));
  }, [commitDoc]);
  const setCaptionColor = useCallback((color) => {
    commitDoc((d) => ({ ...d, captionColor: color }));
  }, [commitDoc]);
  const setCaptionAnimation = useCallback((anim) => {
    commitDoc((d) => ({ ...d, captionAnimation: anim }));
  }, [commitDoc]);
  const setCaptionFont = useCallback((font) => {
    commitDoc((d) => ({ ...d, captionFont: font }));
  }, [commitDoc]);
  const setCaptionSize = useCallback((size) => {
    commitDoc((d) => ({ ...d, captionSize: size }));
  }, [commitDoc]);
  const setCaptionPosition = useCallback((pos) => {
    commitDoc((d) => ({ ...d, captionPosition: pos }));
  }, [commitDoc]);
  const setCaptionLineHeight = useCallback((lh) => {
    commitDoc((d) => ({ ...d, captionLineHeight: lh }));
  }, [commitDoc]);
  const setCaptionFontScale = useCallback((scale) => {
    commitDoc((d) => ({ ...d, captionFontScale: scale }));
  }, [commitDoc]);
  const setCaptionSingleLine = useCallback((val) => {
    commitDoc((d) => ({ ...d, captionSingleLine: typeof val === "function" ? val(!!d.captionSingleLine) : !!val }));
  }, [commitDoc]);
  const setCaptionsOn = useCallback((val) => {
    commitDoc((d) => ({ ...d, captionsOn: typeof val === "function" ? val(d.captionsOn) : val }));
  }, [commitDoc]);
  const setCaptionEffects = useCallback((val) => {
    commitDoc((d) => ({
      ...d,
      captionEffects: typeof val === "function" ? val(d.captionEffects || []) : val,
    }));
  }, [commitDoc]);
  const setCaptionEffectsOn = useCallback((val) => {
    commitDoc((d) => ({
      ...d,
      captionEffectsOn: typeof val === "function" ? val(d.captionEffectsOn !== false) : val,
    }));
  }, [commitDoc]);

  const onAudio = useCallback(async (files) => {
    const file = files?.[0] || files;
    if (!file || !(file instanceof Blob)) return;
    setError(null);
    try {
      const d = await getAudioDuration(file);
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setAudioDuration(d);
      getWaveformPeaks(file).then(setPeaks).catch(() => {});

      // If real audio was uploaded and existing timeline images were auto-spaced,
      // automatically re-sync their timing evenly across the new audio duration!
      if (file.name !== "timeline_guide_track.wav" && d > 0) {
        commitDoc((prevDoc) => {
          const validSlots = (prevDoc.slots || []).filter(
            (s) => !s.empty && s.img && !s.file?.isStarterPlaceholder
          );
          if (validSlots.length > 0 && validSlots.every((s) => s.autoSpaced)) {
            const count = validSlots.length;
            const step = d / count;
            let idx = 0;
            const nextSlots = (prevDoc.slots || []).map((s) => {
              if (s.empty || !s.img || s.file?.isStarterPlaceholder) return s;
              const sec = +(idx * step).toFixed(3);
              idx++;
              return { ...s, seconds: sec, autoSpaced: true };
            });
            return { ...prevDoc, slots: nextSlots };
          }
          return prevDoc;
        });
      }
    } catch (e) {
      setError(e.message);
    }
  }, [commitDoc]);

  const addImages = useCallback(async (fileList) => {
    const rawFiles = Array.from(fileList || []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (!rawFiles.length) return;
    setImporting({ done: 0, total: rawFiles.length });
    try {
      const batch = analyzeUploadedMediaBatch(rawFiles);
      const loaded = await Promise.all(
        batch.parsed.map(async ({ file: f, seconds }) => {
          const img = f.type.startsWith("video/") ? await loadVideoEl(f) : await loadImageEl(f);
          setImporting((p) => (p ? { ...p, done: p.done + 1 } : p));
          return { file: f, seconds, img, autoSpaced: batch.mode === "even" };
        })
      );

      // Check if we are still on the synthetic guide audio and need to expand it
      // so all uploaded images fit cleanly on the timeline.
      const isGuideAudio = !audioFile || audioFile.name === "timeline_guide_track.wav";
      let effectiveDur = audioDuration > 0 ? audioDuration : 30;

      if (isGuideAudio && !rawFiles[0]?.isStarterPlaceholder) {
        if (batch.mode === "timecode") {
          const maxTs = loaded.reduce((acc, it) => Math.max(acc, it.seconds || 0), 0);
          if (maxTs + 5 > effectiveDur) {
            effectiveDur = Math.ceil(maxTs + 5);
            const newSilent = createSilentWavFile(effectiveDur);
            await onAudio([newSilent]);
          }
        } else {
          // For evenly distributed images without real audio, give ~4s per image if total > 30s
          const existingRealCount = (doc.slots || []).filter(
            (s) => !s.empty && s.img && !s.file?.isStarterPlaceholder
          ).length;
          const totalCount = existingRealCount + loaded.length;
          const neededDur = Math.max(30, totalCount * 4);
          if (neededDur > effectiveDur) {
            effectiveDur = neededDur;
            const newSilent = createSilentWavFile(effectiveDur);
            await onAudio([newSilent]);
          }
        }
      }

      commitDoc((d) => {
        // Remove starter placeholder card if user is uploading real media
        const isOnlyPlaceholder =
          d.slots.length === 1 &&
          d.slots[0]?.file?.isStarterPlaceholder &&
          !loaded[0]?.file?.isStarterPlaceholder;
        const next = isOnlyPlaceholder ? [] : d.slots.map((s) => ({ ...s }));

        if (batch.mode === "timecode") {
          for (const { file, seconds, img } of loaded) {
            const ts = seconds != null ? seconds : next.length * 4;
            const slot = next.find((s) => s.seconds != null && Math.abs(s.seconds - ts) < 0.01);
            if (slot) {
              slot.file = file;
              slot.img = img;
              slot.empty = false;
              slot.autoSpaced = false;
            } else {
              next.push({ id: nextId(), seconds: ts, file, img, empty: false, autoSpaced: false });
            }
          }
        } else {
          // Mode === "even": append and distribute all auto-spaced slots evenly across effectiveDur
          for (const { file, img } of loaded) {
            next.push({ id: nextId(), seconds: 0, file, img, empty: false, autoSpaced: true });
          }
          const activeSlots = next.filter((s) => !s.empty && s.img);
          const allAuto = activeSlots.every((s) => s.autoSpaced || s.file?.isStarterPlaceholder);
          if (allAuto && activeSlots.length > 0) {
            const step = effectiveDur / activeSlots.length;
            activeSlots.forEach((s, i) => {
              s.seconds = +(i * step).toFixed(3);
            });
          } else {
            // Mix of existing explicit timecode slots + new un-timestamped slots
            let cursor = next.reduce((mx, s) => Math.max(mx, s.seconds || 0), 0);
            const remaining = Math.max(4, effectiveDur - cursor);
            const step = remaining / Math.max(1, loaded.length);
            let newIdx = 0;
            for (const s of next) {
              if (s.autoSpaced && s.seconds === 0 && newIdx > 0) {
                s.seconds = +(cursor + newIdx * step).toFixed(3);
              }
              if (s.autoSpaced) newIdx++;
            }
          }
        }

        // Sort slots by seconds
        next.sort((a, b) => (a.seconds || 0) - (b.seconds || 0));
        // Ensure first non-empty slot starts at 0:00 so there is no unintended lead-in gap
        if (next.length > 0 && !next[0].empty && next[0].seconds > 0) {
          next[0].seconds = 0;
        }

        // Automatically apply active channel transitions & Ken Burns motion to the clips
        const ed = activeChannel?.editorConfig || {};
        const mode = ed.motionMode || "alternate";
        const nextMotion = { ...(d.motionByName || {}) };
        const slotIds = next.filter((s) => !s.empty && s.img).map((s) => s.id);
        if (slotIds.length > 0) {
          slotIds.forEach((id, idx) => {
            if (mode === "alternate") nextMotion[id] = idx % 2 === 0 ? "zoomin" : "zoomout";
            else if (mode === "zoomin" || mode === "zoomout") nextMotion[id] = mode;
            else nextMotion[id] = "none";
          });
        }

        const nextTransitions = { ...(d.transitionsByName || {}) };
        if (slotIds.length > 1) {
          const trType = ed.transitionType || "fade";
          if (trType === "mix") {
            const customPool =
              Array.isArray(ed.transitionMixPool) && ed.transitionMixPool.length
                ? ed.transitionMixPool
                : ["fade", "wipeleft", "wiperight", "slideleft", "circleopen", "zoomin"];
            const assigned = mixTransitions(customPool, slotIds.length - 1);
            slotIds.slice(1).forEach((id, i) => {
              if (!nextTransitions[id]) nextTransitions[id] = assigned[i];
            });
          } else {
            slotIds.slice(1).forEach((id) => {
              if (!nextTransitions[id]) nextTransitions[id] = trType;
            });
          }
        }

        return {
          ...d,
          slots: next,
          transitionsByName: nextTransitions,
          motionByName: nextMotion,
        };
      });
    } finally {
      setImporting(null);
    }
  }, [commitDoc, audioFile, audioDuration, onAudio, doc.slots, activeChannel]);

  // 1-Click Sync: Distribute all loaded clips evenly across the audio duration (or match SRT cues)
  const handleSyncClipsEvenly = useCallback(() => {
    const totalDur = audioDuration > 0 ? audioDuration : 30;
    commitDoc((d) => {
      const validSlots = (d.slots || []).filter((s) => !s.empty && s.img);
      if (!validSlots.length) return d;
      const step = totalDur / validSlots.length;
      const next = validSlots.map((s, idx) => ({
        ...s,
        seconds: +(idx * step).toFixed(3),
        autoSpaced: true,
      }));
      return { ...d, slots: next };
    });
    setAppliedToast(
      isAr
        ? "تمت مطابقة وتوزيع جميع الصور بالتساوي على طول التايم لاين ✓"
        : "Matched and distributed all clips evenly across the timeline ✓"
    );
    setTimeout(() => setAppliedToast(null), 2800);
  }, [audioDuration, commitDoc, isAr]);

  const replaceImage = useCallback(async (id, file) => {
    if (!file) return;
    const isVid = file.type.startsWith("video/");
    if (!isVid && !file.type.startsWith("image/")) return;
    const img = isVid ? await loadVideoEl(file) : await loadImageEl(file);

    commitDoc((d) => {
      // Keep exact slot timing and duration without shifting other clips or expanding to natural video duration
      const updatedSlots = (d.slots || []).map((s) => {
        if (s.id === id) {
          return { ...s, file, img, empty: false };
        }
        return s;
      });

      const nextFit = { ...(d.fitByName || {}) };
      if (isVid) {
        nextFit[id] = "fit";
      }

      setAppliedToast(
        isAr
          ? "تم استبدال المقطع والحفاظ على توقيت ومدة المشهد بدقة ✓"
          : "Replaced clip while preserving exact slot timing ✓"
      );
      setTimeout(() => setAppliedToast(null), 2500);

      return {
        ...d,
        slots: updatedSlots,
        fitByName: nextFit,
      };
    });
  }, [commitDoc, isAr]);

  const removeImage = useCallback((id) => {
    commitDoc((d) => {
      const remainingSlots = (d.slots || []).filter((s) => s.id !== id);
      if (!remainingSlots.length) {
        return {
          ...d,
          slots: [],
          transitionsByName: {},
          speedByName: {},
          motionByName: {},
          trimByName: {},
          volumeByName: {},
          fitByName: {},
          effectByName: {},
        };
      }

      // Sort remaining slots
      remainingSlots.sort((a, b) => (a.seconds || 0) - (b.seconds || 0));

      // Always ensure the first clip starts cleanly at 0:00 (no lead-in black gap)
      if (remainingSlots[0].seconds > 0) {
        const offset = remainingSlots[0].seconds;
        remainingSlots.forEach((s) => {
          s.seconds = Math.max(0, +(s.seconds - offset).toFixed(3));
        });
      }

      // Clean up orphaned transition/motion/speed mappings for removed id
      const nextTransitions = { ...(d.transitionsByName || {}) };
      delete nextTransitions[id];
      const nextSpeed = { ...(d.speedByName || {}) };
      delete nextSpeed[id];
      const nextMotion = { ...(d.motionByName || {}) };
      delete nextMotion[id];
      const nextTrim = { ...(d.trimByName || {}) };
      delete nextTrim[id];
      const nextVolume = { ...(d.volumeByName || {}) };
      delete nextVolume[id];
      const nextFit = { ...(d.fitByName || {}) };
      delete nextFit[id];
      const nextEffect = { ...(d.effectByName || {}) };
      delete nextEffect[id];

      setAppliedToast(
        isAr
          ? "تم حذف المقطع وإغلاق الفراغ تلقائياً (Ripple Delete) ✓"
          : "Deleted clip and closed gap cleanly (Ripple Delete) ✓"
      );
      setTimeout(() => setAppliedToast(null), 2500);

      return {
        ...d,
        slots: remainingSlots,
        transitionsByName: nextTransitions,
        speedByName: nextSpeed,
        motionByName: nextMotion,
        trimByName: nextTrim,
        volumeByName: nextVolume,
        fitByName: nextFit,
        effectByName: nextEffect,
      };
    });
  }, [commitDoc, isAr]);

  const fillGap = useCallback(async (name, file) => {
    if (!file) return;
    const isVid = file.type.startsWith("video/");
    if (!isVid && !file.type.startsWith("image/")) return;
    const img = isVid ? await loadVideoEl(file) : await loadImageEl(file);
    commitDoc((d) => {
      if (name === LEAD_IN) {
        return { ...d, slots: [...d.slots, { id: nextId(), seconds: 0, file, img, empty: false }] };
      }
      return { ...d, slots: d.slots.map((s) => (s.id === name ? { ...s, file, img, empty: false } : s)) };
    });
  }, [commitDoc]);

  const resizeBoundary = useCallback((id, seconds) => {
    commitDoc((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === id ? { ...s, seconds: +seconds.toFixed(3), autoSpaced: false } : s)),
    }));
  }, [commitDoc]);

  const onCaptionFile = useCallback(async (file) => {
    if (!file) return;
    const f = file instanceof File ? file : file[0];
    if (!f) return;
    try {
      const text = await f.text();
      setCaptionRaw(text);
      setCaptionName(f.name);
      setCaptionsOn(true);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [setCaptionsOn]);

  const captionParse = useMemo(
    () => (captionRaw ? parseTranscript(captionRaw, audioDuration) : { cues: [], error: null }),
    [captionRaw, audioDuration]
  );
  const captionCues = captionParse.cues;
  const captionError = captionParse.error;

  const setTransition = useCallback((name, type) => {
    commitDoc((d) => ({ ...d, transitionsByName: { ...d.transitionsByName, [name]: type } }));
  }, [commitDoc]);

  const applyTransitionAll = useCallback((type, clipNames) => {
    commitDoc((d) => {
      const next = {};
      for (let i = 1; i < clipNames.length; i++) next[clipNames[i]] = type;
      return { ...d, transitionsByName: next };
    });
  }, [commitDoc]);

  const setMotion = useCallback((name, type) => {
    commitDoc((d) => ({
      ...d,
      motionByName: { ...(d.motionByName || {}), [name]: type },
    }));
  }, [commitDoc]);
  const setTrim = useCallback((name, seconds) => {
    commitDoc((d) => ({
      ...d,
      trimByName: { ...(d.trimByName || {}), [name]: Math.max(0, +seconds || 0) },
    }));
  }, [commitDoc]);
  const setVolume = useCallback((name, vol) => {
    commitDoc((d) => ({
      ...d,
      volumeByName: { ...(d.volumeByName || {}), [name]: Math.min(1, Math.max(0, +vol || 0)) },
    }));
  }, [commitDoc]);
  const setFit = useCallback((name, mode) => {
    commitDoc((d) => ({
      ...d,
      fitByName: { ...(d.fitByName || {}), [name]: mode },
    }));
  }, [commitDoc]);
  const setClipSpeed = useCallback((name, speed) => {
    commitDoc((d) => ({
      ...d,
      speedByName: { ...(d.speedByName || {}), [name]: Math.max(0.1, Math.min(10, +speed || 1)) },
    }));
  }, [commitDoc]);

  // Split / Cut any clip into two adjacent parts at timestamp `time`
  const splitClipAtTime = useCallback((time) => {
    if (time == null || isNaN(time)) return;
    const t = Math.max(0.1, +time.toFixed(3));
    commitDoc((d) => {
      const currentSlots = d.slots || [];
      if (!currentSlots.length) return d;
      // Map slots to items format expected by buildTimeline
      const currentItems = currentSlots.map((s) => ({
        name: s.id,
        seconds: s.seconds,
        empty: s.empty,
        label: (s.img && s.img.fileName) || (s.file && s.file.name) || s.id,
      }));
      const { clips: activeClips } = buildTimeline(currentItems, audioDuration || 30);
      const clipList = Array.isArray(activeClips) ? activeClips : [];
      const targetClip = clipList.find((c) => t > c.start + 0.15 && t < c.start + c.duration - 0.15);
      if (!targetClip || targetClip.gap) return d;

      const targetSlot = currentSlots.find((s) => s.id === targetClip.name);
      if (!targetSlot || !targetSlot.img) return d;

      // Create a split clone slot starting precisely at `t`
      const newSlotId = nextId();
      const newSlot = {
        id: newSlotId,
        seconds: t,
        file: targetSlot.file,
        img: targetSlot.img,
        empty: false,
        autoSpaced: false,
      };

      const nextSlots = [...currentSlots, newSlot];
      nextSlots.sort((a, b) => (a.seconds || 0) - (b.seconds || 0));

      // Inherit speed and motion settings
      const nextSpeed = { ...(d.speedByName || {}) };
      if (nextSpeed[targetClip.name]) {
        nextSpeed[newSlotId] = nextSpeed[targetClip.name];
      }
      const nextMotion = { ...(d.motionByName || {}) };
      if (nextMotion[targetClip.name]) {
        nextMotion[newSlotId] = nextMotion[targetClip.name];
      }

      setAppliedToast(
        isAr
          ? `تم تقطيع المشهد بنجاح عند ${t.toFixed(1)} ثانية ✂`
          : `Split clip successfully at ${t.toFixed(1)}s ✂`
      );
      setTimeout(() => setAppliedToast(null), 2500);

      return {
        ...d,
        slots: nextSlots,
        speedByName: nextSpeed,
        motionByName: nextMotion,
      };
    });
  }, [commitDoc, audioDuration, nextId, isAr]);

  // Audio Speed Adjustment: resamples voiceover using Web Audio API
  const handleAudioSpeedChange = useCallback(async (newSpeed) => {
    if (!audioFile) return;
    try {
      const edited = await processAudioFile(audioFile, { speed: newSpeed, filename: `voiceover_${newSpeed}x.wav` });
      setAudioSpeed(newSpeed);
      await onAudio([edited]);
      setAppliedToast(
        isAr
          ? `تم تغيير سرعة الصوت إلى ${newSpeed}× بنجاح ⚡`
          : `Audio speed updated to ${newSpeed}× successfully ⚡`
      );
      setTimeout(() => setAppliedToast(null), 2500);
    } catch (err) {
      setError(`Audio speed error: ${err.message}`);
    }
  }, [audioFile, onAudio, isAr]);

  // Audio Trimming: trims [start, end] and updates master audio track
  const handleAudioTrim = useCallback(async (startSec, endSec) => {
    if (!audioFile) return;
    try {
      const edited = await processAudioFile(audioFile, {
        start: startSec,
        end: endSec,
        speed: audioSpeed,
        filename: `voiceover_trimmed_${startSec}s-${endSec}s.wav`,
      });
      await onAudio([edited]);
      setAppliedToast(
        isAr
          ? `تم تقطيع الصوت من ${startSec}s إلى ${endSec}s بنجاح ✂`
          : `Trimmed audio from ${startSec}s to ${endSec}s successfully ✂`
      );
      setTimeout(() => setAppliedToast(null), 2500);
    } catch (err) {
      setError(`Audio trim error: ${err.message}`);
    }
  }, [audioFile, audioSpeed, onAudio, isAr]);

  const setClipEffect = useCallback((name, patch) => {
    commitDoc((d) => ({
      ...d,
      effectByName: {
        ...(d.effectByName || {}),
        [name]: { id: "none", intensity: 0.5, ...(d.effectByName?.[name] || {}), ...patch },
      },
    }));
  }, [commitDoc]);
  const removeClipEffect = useCallback((name) => {
    commitDoc((d) => {
      const next = { ...(d.effectByName || {}) };
      delete next[name];
      return { ...d, effectByName: next };
    });
  }, [commitDoc]);

  const addSfx = useCallback((at) => {
    setSelectedSound((sel) => {
      if (sel) {
        commitDoc((d) => ({
          ...d,
          sfx: [...(d.sfx || []), makeSfx(sel.name, sel.src, at)],
        }));
      }
      return sel;
    });
  }, [commitDoc]);
  const moveSfx = useCallback((id, at) => {
    commitDoc((d) => ({
      ...d,
      sfx: (d.sfx || []).map((s) => (s.id === id ? { ...s, at: Math.max(0, +at || 0) } : s)),
    }));
  }, [commitDoc]);
  const setSfxVolume = useCallback((id, v) => {
    commitDoc((d) => ({
      ...d,
      sfx: (d.sfx || []).map((s) => (s.id === id ? { ...s, volume: Math.min(1, Math.max(0, +v || 0)) } : s)),
    }));
  }, [commitDoc]);
  const removeSfx = useCallback((id) => {
    commitDoc((d) => ({
      ...d,
      sfx: (d.sfx || []).map((s) => s.id !== id),
    }));
  }, [commitDoc]);
  const uploadSfx = useCallback((file) => {
    if (!file) return;
    const mediaId = `sfx-${newId()}`;
    const url = URL.createObjectURL(file);
    const label = file.name.replace(/\.[^.]+$/, "") || "sound";
    const entry = { mediaId, label, url, _file: file };
    setSfxUploads((prev) => [...prev, entry]);
    setSelectedSound({ name: label, src: { kind: "upload", mediaId }, url });
  }, []);
  const sfxUrlFor = useCallback((src) => {
    if (!src) return null;
    if (src.kind === "lib") return src.file;
    const u = sfxUploads.find((x) => x.mediaId === src.mediaId);
    return u ? u.url : null;
  }, [sfxUploads]);
  const sfxResolved = useMemo(
    () => sfx.map((s) => ({ id: s.id, at: s.at, volume: s.volume, url: sfxUrlFor(s.src) })),
    [sfx, sfxUrlFor]
  );

  const applyMotionAll = useCallback((type, names) => {
    commitDoc((d) => {
      const next = {};
      for (const n of names) next[n] = type;
      return { ...d, motionByName: next };
    });
  }, [commitDoc]);
  const applyMotionAlternate = useCallback((names) => {
    commitDoc((d) => {
      const next = {};
      names.forEach((n, i) => { next[n] = i % 2 === 0 ? "zoomin" : "zoomout"; });
      return { ...d, motionByName: next };
    });
  }, [commitDoc]);
  const applyTransitionMix = useCallback((picks, clipNames) => {
    const cutNames = clipNames.slice(1);
    const assigned = mixTransitions(picks, cutNames.length);
    commitDoc((d) => {
      const next = {};
      cutNames.forEach((name, i) => { next[name] = assigned[i]; });
      return { ...d, transitionsByName: next };
    });
  }, [commitDoc]);

  // Apply Channel Editor Style & Presets to the active Video Editor
  const applyChannelEditorPresets = useCallback((channel, showToast = false) => {
    if (!channel) return;
    setSelectedChannelId(channel.id);
    if (channel.aspectRatio) {
      setAspect(channel.aspectRatio);
    }
    const ed = channel.editorConfig || {};
    if (ed.transitionDuration != null) setTransitionDuration(ed.transitionDuration);
    if (ed.motionAmount != null) setMotionAmount(ed.motionAmount);
    if (ed.fadeIn != null) setFadeIn(ed.fadeIn);
    if (ed.fadeOut != null) setFadeOut(ed.fadeOut);

    const mode = ed.motionMode || "alternate";
    commitDoc((d) => {
      const slotIds = (d.slots || []).filter((s) => !s.empty && s.img).map((s) => s.id);
      const nextMotion = { ...(d.motionByName || {}) };
      if (slotIds.length > 0) {
        slotIds.forEach((id, idx) => {
          if (mode === "alternate") nextMotion[id] = idx % 2 === 0 ? "zoomin" : "zoomout";
          else if (mode === "zoomin" || mode === "zoomout") nextMotion[id] = mode;
          else nextMotion[id] = "none";
        });
      }

      const nextTransitions = { ...(d.transitionsByName || {}) };
      if (slotIds.length > 1 && ed.transitionType) {
        if (ed.transitionType === "mix") {
          const customPool =
            Array.isArray(ed.transitionMixPool) && ed.transitionMixPool.length
              ? ed.transitionMixPool
              : ["fade", "wipeleft", "wiperight", "slideleft", "circleopen", "zoomin"];
          const assigned = mixTransitions(customPool, slotIds.length - 1);
          slotIds.slice(1).forEach((id, i) => {
            nextTransitions[id] = assigned[i];
          });
        } else {
          slotIds.slice(1).forEach((id) => {
            nextTransitions[id] = ed.transitionType;
          });
        }
      }
      return {
        ...d,
        effectId: ed.effectId || d.effectId || "none",
        effectIntensity: ed.effectIntensity ?? d.effectIntensity ?? 0.5,
        captionsOn: ed.captionsOn ?? d.captionsOn ?? true,
        captionStyle: ed.captionStyle || d.captionStyle || "classic",
        captionFont: ed.captionFont || d.captionFont || "montserrat",
        captionColor: ed.captionColor || d.captionColor || "#FFFFFF",
        captionAnimation: ed.captionAnimation || d.captionAnimation || "pop",
        captionSize: ed.captionSize || d.captionSize || "md",
        captionFontScale: ed.captionFontScale !== undefined ? ed.captionFontScale : d.captionFontScale,
        captionLineHeight: ed.captionLineHeight !== undefined ? ed.captionLineHeight : d.captionLineHeight,
        captionSingleLine: ed.captionSingleLine !== undefined ? !!ed.captionSingleLine : !!d.captionSingleLine,
        captionPosition: captionPosPct(ed.captionPosition ?? d.captionPosition ?? 0),
        transitionsByName: nextTransitions,
        motionByName: nextMotion,
      };
    });

    if (showToast) {
      setAppliedToast(
        isAr
          ? `تم تطبيق ستايل وإعدادات قناة "${channel.name}" على المحرر ✓`
          : `Applied "${channel.name}" channel style & presets to Editor ✓`
      );
      setTimeout(() => setAppliedToast(null), 3200);
    }
  }, [commitDoc, isAr]);

  // Initialize starter timeline card + guide audio on first mount so Editor is immediately ready
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    (async () => {
      try {
        await requestPersist();
        const savedSettings = await getGlobalSettings();
        let initialSettings = globalSettings;
        if (savedSettings && Array.isArray(savedSettings.channels) && savedSettings.channels.length) {
          initialSettings = savedSettings;
          setGlobalSettings(savedSettings);
          setSelectedChannelId(savedSettings.defaultChannelId || savedSettings.channels[0].id);
          ensureFirestoreSettingsSeeded(savedSettings);
        } else {
          ensureFirestoreSettingsSeeded(globalSettings);
        }

        // Create starter guide track and scene card so the Editor is immediately interactive
        const silentFile = createSilentWavFile(30);
        await onAudio([silentFile]);
        const starterCard = await createSceneCardFile({
          sceneNumber: 1,
          startTime: 0,
          visualDescription: "AutoEditor — Video & Channel Style Studio",
          scriptExcerpt: "Upload voiceover audio & scene media above, or click Load Sample Demo to test.",
        });
        await addImages([starterCard]);

        const ch =
          initialSettings.channels?.find((c) => c.id === initialSettings.defaultChannelId) ||
          initialSettings.channels?.[0];
        if (ch) {
          applyChannelEditorPresets(ch, false);
        }
      } catch (_) {}
    })();
  }, []);

  const handleSaveGlobalSettings = useCallback(async (newSettings) => {
    setGlobalSettings(newSettings);
    await saveGlobalSettings(newSettings);
    // Also keep active channel presets synced if user edited the currently selected channel
    const updatedActive = (newSettings?.channels || []).find((c) => c.id === selectedChannelId);
    if (updatedActive) {
      applyChannelEditorPresets(updatedActive, false);
    }
  }, [selectedChannelId, applyChannelEditorPresets]);

  const items = useMemo(
    () => slots.map((s) => ({
      name: s.id, seconds: s.seconds, empty: s.empty,
      label: (s.img && s.img.fileName) || (s.file && s.file.name) || s.id,
    })),
    [slots]
  );
  const imagesByName = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.file && !(s.img && s.img.isVideo)) m[s.id] = s.file;
    return m;
  }, [slots]);
  const videosByName = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.file && s.img && s.img.isVideo) m[s.id] = s.file;
    return m;
  }, [slots]);
  const videoInfoByName = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.img && s.img.isVideo) {
      m[s.id] = { url: s.img.videoUrl, duration: s.img.videoDuration || 0 };
    }
    return m;
  }, [slots]);
  const imageEls = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.img) m[s.id] = s.img;
    return m;
  }, [slots]);

  const sample = useMemo(() => {
    const imaged = slots
      .filter((s) => !s.empty && s.img && s.seconds != null)
      .sort((a, b) => a.seconds - b.seconds);
    const el = imaged[0] && imaged[0].img;
    return el ? { width: el.mediaWidth || el.naturalWidth, height: el.mediaHeight || el.naturalHeight } : null;
  }, [slots]);

  const dims = useMemo(() => resolveDimensions(aspect, sample), [aspect, sample]);
  const renderDims = useMemo(
    () => (renderQuality === "720p" ? capTo720(dims) : dims),
    [renderQuality, dims]
  );

  useEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        setRenderQuality("720p");
        setFps(24);
      }
    } catch { /* ignore */ }
  }, []);

  const { clips, warnings } = useMemo(
    () => buildTimeline(items, audioDuration),
    [items, audioDuration]
  );

  useEffect(() => { setTrimEnd(audioDuration); }, [audioDuration]);

  const exportDuration = trimEnd > 0 ? Math.min(trimEnd, audioDuration) : audioDuration;

  const cancelRef = useRef(false);
  const onCancel = useCallback(() => {
    cancelRef.current = true;
    cancelRender();
    setBusy(false);
    setProgress(0);
  }, []);
  const wcCancelRef = useRef(false);
  const onWebCodecsCancel = useCallback(() => { wcCancelRef.current = true; }, []);

  const onRender = useCallback(async () => {
    cancelRef.current = false;
    setBusy(true); setError(null); setOutUrl(null); setProgress(0);
    try {
      const exportClips = trimClips(clips, exportDuration);
      const transitions = exportClips.map((c) => transitionsByName[c.name] || "cut");
      const motions = exportClips.map((c) => motionByName[c.name] || "none");
      const modeOf = (c) => {
        const info = videoInfoByName[c.name];
        if (!info) return "fit";
        return fitByName[c.name] || ((info.duration || 0) > (c.duration || 0) ? "trim" : "fit");
      };
      const trims = exportClips.map((c) =>
        (videoInfoByName[c.name] && modeOf(c) === "trim") ? (trimByName[c.name] || 0) : 0);
      const speeds = exportClips.map((c) => {
        const info = videoInfoByName[c.name];
        if (!info) return 1;
        const dur = info.duration || 0, slot = c.duration || 0;
        return (modeOf(c) === "fit" && slot > 0 && dur > 0 && Math.abs(dur - slot) > 0.05) ? +(dur / slot).toFixed(4) : 1;
      });
      const volumes = exportClips.map((c) =>
        Object.prototype.hasOwnProperty.call(videosByName, c.name)
          ? (volumeByName[c.name] == null ? 0.5 : volumeByName[c.name]) : 0);
      const captions = captionsOn && captionCues.length ? captionCues : null;
      const blob = await renderVideo({
        clips: exportClips, imagesByName, videosByName, audioFile,
        width: renderDims.width, height: renderDims.height, fps,
        transitions, transitionDuration, motions, motionAmount, trims, volumes, speeds, fadeIn, fadeOut, effectId, effectIntensity, effectByName,
        captions, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition,
        onProgress: setProgress,
      });
      setOutUrl(URL.createObjectURL(blob));
    } catch (e) {
      if (!cancelRef.current) setError(e.message || String(e));
    } finally {
      if (!cancelRef.current) setBusy(false);
    }
  }, [clips, exportDuration, imagesByName, videosByName, audioFile, renderDims, fps, transitionsByName, transitionDuration,
      motionByName, motionAmount, trimByName, volumeByName, fitByName, videoInfoByName, fadeIn, fadeOut, effectId, effectIntensity, effectByName,
      captionsOn, captionCues, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition]);

  const [wcBusy, setWcBusy] = useState(false);
  const [wcProgress, setWcProgress] = useState(0);
  const [wcPhase, setWcPhase] = useState("Rendering");
  const [doneMsg, setDoneMsg] = useState(null);
  const doneTimerRef = useRef(0);
  const flashDone = useCallback((msg) => {
    setDoneMsg(msg);
    clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => setDoneMsg(null), 6000);
  }, []);
  const [wcOk, setWcOk] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [wcEnabled, setWcEnabled] = useState(true);
  const [wcProfile, setWcProfile] = useState(null);
  const [renderChecked, setRenderChecked] = useState(false);

  // Dedicated Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportElapsedTime, setExportElapsedTime] = useState(0);
  const [exportFileName, setExportFileName] = useState("");
  const [exportFileSize, setExportFileSize] = useState("");
  const [exportError, setExportError] = useState(null);
  const exportTimerRef = useRef(null);

  useEffect(() => {
    const isBusy = wcBusy || busy;
    if (isBusy) {
      setExportElapsedTime(0);
      const start = Date.now();
      exportTimerRef.current = setInterval(() => {
        setExportElapsedTime(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (exportTimerRef.current) clearInterval(exportTimerRef.current);
    }
    return () => {
      if (exportTimerRef.current) clearInterval(exportTimerRef.current);
    };
  }, [wcBusy, busy]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [wc, srv] = await Promise.all([
        webCodecsCanRender().catch(() => false),
        probeBackend().catch(() => false),
      ]);
      if (!alive) return;
      setWcOk(wc); setServerAvailable(srv); setRenderChecked(true);
    })();
    return () => { alive = false; };
  }, []);

  const cantRender = false; // Always allow editing & exporting with universal canvas fallback

  useEffect(() => {
    let alive = true;
    if (!wcOk) { setWcProfile(null); return; }
    pickRenderProfile(renderDims.width, renderDims.height, fps, 8_000_000)
      .then((p) => { if (alive) setWcProfile(p); }).catch(() => { if (alive) setWcProfile(null); });
    return () => { alive = false; };
  }, [wcOk, renderDims.width, renderDims.height, fps]);

  const onWebCodecsTest = useCallback(async () => {
    wcCancelRef.current = false;
    setIsExportModalOpen(true);
    setExportError(null);
    const logs = [];

    const baseName = (projectTitle || (activeChannel && activeChannel.name) || "autoeditor")
      .replace(/[^\w\u0600-\u06FF.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "autoeditor";
    const fileName = `${baseName}.mp4`;
    setExportFileName(fileName);

    setWcBusy(true);
    setWcProgress(0.02);
    setWcPhase(isAr ? "تحضير محرك معالجة الفيديو..." : "Initializing video render engine...");
    const stopKeepAwake = startKeepAwake();
    try {
      const exportClips = trimClips(clips, exportDuration);
      if (!exportClips.length) throw new Error(isAr ? "لا توجد مقاطع لتصديرها في الخط الزمني" : "No clips to export on timeline");

      let profile = wcProfile;
      if (!profile) {
        try {
          profile = await pickRenderProfile(renderDims.width, renderDims.height, fps, 8_000_000);
        } catch (_) {
          profile = null;
        }
      }

      const transitions = exportClips.map((c) => transitionsByName[c.name] || "cut");
      const motions = exportClips.map((c) => motionByName[c.name] || "none");
      const modeOf = (c) => {
        const info = videoInfoByName[c.name];
        if (!info) return "fit";
        return fitByName[c.name] || ((info.duration || 0) > (c.duration || 0) ? "trim" : "fit");
      };
      const trims = exportClips.map((c) =>
        (videoInfoByName[c.name] && modeOf(c) === "trim") ? (trimByName[c.name] || 0) : 0);
      const speeds = exportClips.map((c) => {
        if (speedByName[c.name] != null) return +speedByName[c.name];
        const info = videoInfoByName[c.name];
        if (!info) return 1;
        const dur = info.duration || 0, slot = c.duration || 0;
        return (modeOf(c) === "fit" && slot > 0 && dur > 0 && Math.abs(dur - slot) > 0.05) ? +(dur / slot).toFixed(4) : 1;
      });
      const volumes = exportClips.map((c) =>
        Object.prototype.hasOwnProperty.call(videosByName, c.name)
          ? (volumeByName[c.name] == null ? 0.5 : volumeByName[c.name]) : 0);
      const bitrate = 8_000_000;

      let blob = null;

      // 1. Try Hardware GPU WebCodecs first
      if (profile && typeof VideoEncoder !== "undefined") {
        try {
          blob = await renderWebCodecs(
            {
              clips: exportClips, width: renderDims.width, height: renderDims.height, fps, bitrate, profile,
              transitions, transitionDuration, motions, motionAmount, audioFile,
              videosByName, trims, speeds, volumes,
              cues: captionsOn && captionCues.length ? captionCues : null,
              captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionSingleLine, captionFont, captionPosition,
              captionEffects: captionEffectsOn ? captionEffects : [],
              captionEffectsOn,
              effectId, effectIntensity, effectByName,
              sfx: sfxResolved,
            },
            imagesByName,
            (frac, phase) => {
              setWcProgress(frac);
              if (phase) setWcPhase(phase);
            },
            () => wcCancelRef.current,
            logs,
            null,
          );
        } catch (wcErr) {
          if (wcErr && wcErr.cancelled) throw wcErr;
          console.warn("WebCodecs encountered an issue, falling back to CanvasCapture engine:", wcErr);
        }
      }

      // 2. Fallback to CanvasCapture engine if WebCodecs was not supported or failed
      if (!blob && !wcCancelRef.current) {
        setWcPhase(isAr ? "المعالجة بمحرك Canvas الشامل..." : "Rendering with Canvas capture engine...");
        blob = await renderCanvasCapture(
          {
            clips: exportClips, width: renderDims.width, height: renderDims.height, fps,
            transitions, transitionDuration, motions, motionAmount, audioFile,
            videosByName, trims, speeds, volumes,
            cues: captionsOn && captionCues.length ? captionCues : null,
            captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionSingleLine, captionFont, captionPosition,
            captionEffects: captionEffectsOn ? captionEffects : [],
            captionEffectsOn,
            effectId, effectIntensity, effectByName,
          },
          imagesByName,
          (frac, phase) => {
            setWcProgress(frac);
            if (phase) setWcPhase(phase);
          },
          () => wcCancelRef.current,
          logs
        );
      }

      const audioIssue = logs.find((l) => /audio failed|produced no audio/i.test(l));
      if (blob) {
        const url = URL.createObjectURL(blob);
        setOutUrl(url);
        setExportFileSize(`${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
        setWcProgress(1.0);
        setWcPhase(isAr ? "اكتمل التصدير 100%" : "Export complete 100%");

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();

        flashDone(audioIssue ? `Downloaded “${fileName}” — no audio` : `Downloaded “${fileName}”`);
      }
      if (audioIssue) {
        showAlert("Your video was created, but the audio couldn’t be added, so the file has no sound.",
          { title: "Video saved without audio", details: `${audioIssue}\n\nThis usually means an unusual audio format. Try re-exporting the voiceover as a standard 48 kHz WAV or MP3 and render again.` });
      }
    } catch (e) {
      if (!(e && e.cancelled)) {
        setExportError(e && e.message ? e.message : String(e));
        const details = [
          `Error: ${e && e.message ? e.message : String(e)}`,
          "",
          "— render log —",
          ...logs,
          "",
          "— environment —",
          `resolution: ${renderDims.width}x${renderDims.height} @ ${fps}fps`,
          `userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
          e && e.stack ? `\nstack:\n${e.stack}` : "",
        ].join("\n");
        showAlert(isAr ? "فشلت عملية التصدير. يمكنك مراجعة التفاصيل وإعادة المحاولة." : "Export failed. Please check details and try again.",
          { title: isAr ? "فشل التصدير" : "Export failed", details });
      }
    } finally {
      stopKeepAwake();
      setWcBusy(false);
    }
  }, [clips, exportDuration, transitionsByName, motionByName, imagesByName, renderDims, fps, transitionDuration, motionAmount, effectId, effectIntensity, effectByName, sfxResolved, audioFile,
      videosByName, videoInfoByName, fitByName, trimByName, volumeByName, activeChannel, projectTitle, flashDone, wcProfile, isAr,
      captionsOn, captionCues, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionSingleLine, captionFont, captionPosition, captionEffects, captionEffectsOn]);

  const [loadingSample, setLoadingSample] = useState(false);
  const loadSampleDemo = useCallback(async () => {
    try {
      setLoadingSample(true);
      setError(null);
      const audioRes = await fetch("/sample-test/voiceover.wav");
      if (!audioRes.ok) throw new Error("Could not load sample voiceover");
      const audioBlob = await audioRes.blob();
      const audioFileObj = new File([audioBlob], "voiceover.wav", { type: "audio/wav" });
      await onAudio([audioFileObj]);

      const sampleNames = [
        "0-00.png", "0-03.png", "0-07.png", "0-12.png", "0-16.png",
        "0-20.png", "0-24.png", "0-28.png", "0-31.png", "0-34.png"
      ];
      const imageFiles = [];
      for (const name of sampleNames) {
        const res = await fetch(`/sample-test/${name}`);
        if (res.ok) {
          const b = await res.blob();
          imageFiles.push(new File([b], name, { type: "image/png" }));
        }
      }
      if (imageFiles.length) {
        idRef.current = 0;
        const loaded = await Promise.all(
          imageFiles.map(async (f) => ({
            file: f,
            seconds: parseTimestampName(f.name),
            img: await loadImageEl(f),
          }))
        );
        commitDoc((d) => ({
          ...d,
          slots: loaded.map(({ file, seconds, img }) => ({
            id: nextId(),
            seconds,
            file,
            img,
            empty: false,
          })),
        }));
      }
      const sampleCaptions = `1\n00:00:00,500 --> 00:00:03,000\nThe Lost City of Atlantis — Narrative Production\n\n2\n00:00:03,100 --> 00:00:06,800\nAutomated timeline synced to voiceover\n\n3\n00:00:07,000 --> 00:00:11,500\nVibrant animated captions with custom styling\n\n4\n00:00:12,000 --> 00:00:15,800\nKinetic transitions and atmosphere effects\n\n5\n00:00:16,000 --> 00:00:20,000\nHigh-speed WebCodecs MP4 rendering`;
      setCaptionRaw(sampleCaptions);
      setCaptionName("demo_captions.srt");
      setCaptionsOn(true);

      if (activeChannel) {
        setTimeout(() => applyChannelEditorPresets(activeChannel, true), 50);
      }
    } catch (err) {
      setError("Failed to load demo: " + (err.message || err));
    } finally {
      setLoadingSample(false);
    }
  }, [onAudio, commitDoc, setCaptionsOn, activeChannel, applyChannelEditorPresets]);

  const handleResetTimeline = useCallback(async () => {
    idRef.current = 0;
    const silentFile = createSilentWavFile(30);
    await onAudio([silentFile]);
    const starterCard = await createSceneCardFile({
      sceneNumber: 1,
      startTime: 0,
      visualDescription: `${projectTitle || "AutoEditor"} — Ready for Media`,
      scriptExcerpt: "Upload voiceover audio & scene images/videos in the top bar.",
    });
    const img = await loadImageEl(starterCard);
    setCaptionRaw(null);
    setCaptionName(null);
    setOutUrl(null);
    setError(null);
    resetDoc({
      slots: [{ id: nextId(), seconds: 0, file: starterCard, img, empty: false }],
      transitionsByName: {},
      motionByName: {},
      trimByName: {},
      volumeByName: {},
      fitByName: {},
      speedByName: {},
      effectByName: {},
      sfx: [],
      effectId: activeChannel?.editorConfig?.effectId || "cinema",
      effectIntensity: activeChannel?.editorConfig?.effectIntensity ?? 0.5,
      captionStyle: activeChannel?.editorConfig?.captionStyle || "hormozi",
      captionColor: activeChannel?.editorConfig?.captionColor || "#FFE600",
      captionAnimation: activeChannel?.editorConfig?.captionAnimation || "spring_bounce",
      captionFont: activeChannel?.editorConfig?.captionFont || "montserrat",
      captionSize: activeChannel?.editorConfig?.captionSize || "lg",
      captionPosition: captionPosPct(activeChannel?.editorConfig?.captionPosition ?? 25),
      captionLineHeight: activeChannel?.editorConfig?.captionLineHeight ?? null,
      captionFontScale: activeChannel?.editorConfig?.captionFontScale ?? null,
      captionSingleLine: activeChannel?.editorConfig?.captionSingleLine ?? true,
      captionsOn: activeChannel?.editorConfig?.captionsOn ?? true,
      captionEffects: [],
      captionEffectsOn: true,
    });
  }, [onAudio, resetDoc, activeChannel, projectTitle]);

  const openNewProjectModal = useCallback(() => {
    const nextNum = projectCounter + 1;
    const ch = activeChannel || channels[0] || null;
    setNewProjectForm({
      title: isAr ? `مشروع فيديو #${nextNum}` : `Video Project #${nextNum}`,
      channelId: ch?.id || "",
      aspectRatio: ch?.aspectRatio || aspect || "16:9",
      durationSec: 30,
    });
    setNewProjectModalOpen(true);
  }, [projectCounter, activeChannel, channels, aspect, isAr]);

  const handleCreateNewProject = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const targetChannel =
      channels.find((c) => c.id === newProjectForm.channelId) ||
      activeChannel ||
      channels[0] ||
      null;
    const chosenAspect = newProjectForm.aspectRatio || targetChannel?.aspectRatio || "16:9";
    const chosenDur = Math.max(5, Math.min(600, Number(newProjectForm.durationSec) || 30));
    const nextNum = projectCounter + 1;
    const finalTitle =
      (newProjectForm.title || "").trim() ||
      (isAr ? `مشروع فيديو #${nextNum}` : `Video Project #${nextNum}`);

    setNewProjectModalOpen(false);
    setProjectCounter(nextNum);
    setProjectTitle(finalTitle);
    setAspect(chosenAspect);
    if (targetChannel) {
      setSelectedChannelId(targetChannel.id);
    }

    idRef.current = 0;
    const silentFile = createSilentWavFile(chosenDur);
    await onAudio([silentFile]);

    const cardW = chosenAspect === "9:16" ? 720 : 1280;
    const cardH = chosenAspect === "9:16" ? 1280 : 720;
    const starterCard = await createSceneCardFile(
      {
        sceneNumber: 1,
        startTime: 0,
        visualDescription: `${finalTitle} — ${targetChannel?.name || "Studio"}`,
        scriptExcerpt: isAr
          ? "مشروع جديد جاهز — ارفع ملف التعليق الصوتي والصور/الفيديو وملف الترجمة SRT من الشريط العلوي."
          : "New project ready — import voiceover audio, scene plates (images/video), and SRT captions above.",
      },
      cardW,
      cardH
    );
    const img = await loadImageEl(starterCard);

    setCaptionRaw(null);
    setCaptionName(null);
    setOutUrl(null);
    setError(null);

    const ed = targetChannel?.editorConfig || {};
    if (ed.transitionDuration != null) setTransitionDuration(ed.transitionDuration);
    if (ed.motionAmount != null) setMotionAmount(ed.motionAmount);
    if (ed.fadeIn != null) setFadeIn(ed.fadeIn);
    if (ed.fadeOut != null) setFadeOut(ed.fadeOut);

    resetDoc({
      slots: [{ id: nextId(), seconds: 0, file: starterCard, img, empty: false }],
      transitionsByName: {},
      motionByName: {},
      trimByName: {},
      volumeByName: {},
      fitByName: {},
      speedByName: {},
      effectByName: {},
      sfx: [],
      effectId: ed.effectId || "cinema",
      effectIntensity: ed.effectIntensity ?? 0.5,
      captionStyle: ed.captionStyle || "hormozi",
      captionColor: ed.captionColor || "#FFE600",
      captionAnimation: ed.captionAnimation || "spring_bounce",
      captionFont: ed.captionFont || "montserrat",
      captionSize: ed.captionSize || "lg",
      captionPosition: captionPosPct(ed.captionPosition ?? 25),
      captionLineHeight: ed.captionLineHeight ?? null,
      captionFontScale: ed.captionFontScale ?? null,
      captionSingleLine: ed.captionSingleLine ?? true,
      captionsOn: ed.captionsOn ?? true,
      captionEffects: [],
      captionEffectsOn: true,
    });

    setActivePortal("editor");
    setAppliedToast(
      isAr
        ? `تم إنشاء مشروع جديد "${finalTitle}" بتطبيق ستايل "${targetChannel?.name || "الافتراضي"}" ✓`
        : `Created new project "${finalTitle}" with "${targetChannel?.name || "Default"}" style ✓`
    );
    setTimeout(() => setAppliedToast(null), 3500);
  }, [
    channels,
    newProjectForm,
    activeChannel,
    projectCounter,
    isAr,
    onAudio,
    resetDoc,
  ]);

  if (cantRender) {
    return (
      <main className="unsupported">
        <div className="unsupported__card">
          <img className="unsupported__logo" src="/logo.svg" width="52" height="52" alt="" />
          <h1 className="unsupported__h">Open in Chrome, Edge, or Safari</h1>
          <p className="unsupported__p">
            <span className="unsupported__brand">AutoEditor Studio</span> exports video using your
            browser’s built-in video encoder — which this browser doesn’t have.
          </p>
          <p className="unsupported__p">
            Please open this site in <b>Google Chrome</b>, <b>Microsoft Edge</b>, or <b>Safari 16.4+</b>
            {" "}to create and export your videos. (Firefox isn’t supported.)
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="uyns-shell" dir={isAr ? "rtl" : "ltr"}>
      <DialogHost />
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => {
          if (!wcBusy && !busy) setIsExportModalOpen(false);
        }}
        isExporting={wcBusy || busy}
        exportProgress={wcBusy ? wcProgress : progress}
        exportPhase={wcPhase}
        elapsedTime={exportElapsedTime}
        onStartExport={onWebCodecsTest}
        onCancelExport={onWebCodecsCancel}
        outUrl={outUrl}
        outFileName={exportFileName}
        outFileSize={exportFileSize}
        error={exportError}
        aspect={aspect}
        fps={fps}
        renderQuality={renderQuality}
        exportDuration={exportDuration}
        clipCount={clips.length}
        isAr={isAr}
        wcAvailable={wcOk}
      />

      {doneMsg && (
        <div className="donetoast" role="status" aria-live="polite" onClick={() => setDoneMsg(null)}>
          <span className="donetoast__ok" aria-hidden="true">✓</span>
          <span>Render complete — {doneMsg}</span>
        </div>
      )}

      {appliedToast && (
        <div
          className="donetoast"
          role="status"
          aria-live="polite"
          onClick={() => setAppliedToast(null)}
        >
          <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />
          <span>{appliedToast}</span>
        </div>
      )}

      {importing && (
        <div className="importing" role="status" aria-live="polite">
          <span className="importing__spin" aria-hidden="true" />
          {isAr ? "جاري تحميل الوسائط…" : "Loading media…"} {importing.done} / {importing.total}
        </div>
      )}

      {/* Main Content Full-Width Workspace */}
      <div className="uyns-main flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {/* Top Creative Studio Header Bar (3-Zone Clean Architecture) */}
        <header className="px-4 py-2.5 bg-[var(--panel)] border-b border-[var(--line)] shrink-0 flex items-center justify-between gap-4 select-none">
          {/* Zone 1: Clean Brand & Active Project */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center shadow-md">
                <Film className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-sm text-[var(--text-pure)] tracking-tight">
                AutoEditor
              </span>
            </div>
            <span className="text-[var(--faint)]" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={openNewProjectModal}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text-pure)] transition"
              title={isAr ? "مشروع جديد (Ctrl+N)" : "Project Settings / New Project"}
            >
              <span className="truncate max-w-[140px] text-[var(--text)] font-bold">{projectTitle}</span>
              <span className="text-[10px] font-mono font-bold text-[var(--accent)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded border border-[var(--line)]">
                {aspect}
              </span>
            </button>
          </div>

          {/* Zone 2: Workspace Modes & Media Ingest */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg)] border border-[var(--line)]">
              <button
                type="button"
                onClick={() => setActivePortal("editor")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                  activePortal === "editor"
                    ? "bg-[var(--panel)] text-[var(--text-pure)] shadow-sm border border-[var(--line)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <Film className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{isAr ? "محرر التايم لاين" : "Timeline Editor"}</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePortal("channels")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                  activePortal === "channels"
                    ? "bg-[var(--panel)] text-[var(--text-pure)] shadow-sm border border-[var(--line)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <Tv className="w-3.5 h-3.5 text-[var(--emerald)]" />
                <span>{isAr ? `القنوات والستايلات (${channels.length})` : `Channels (${channels.length})`}</span>
              </button>
            </div>

            {/* Quick Media Ingest Triggers in Timeline Mode */}
            {activePortal === "editor" && (
              <div className="hidden md:flex items-center gap-1.5">
                <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] text-xs font-semibold text-[var(--text)] hover:text-[var(--text-pure)] cursor-pointer transition">
                  <Upload className="w-3 h-3 text-[var(--accent)]" />
                  <span>{isAr ? "إضافة وسائط" : "+ Media"}</span>
                  <span className="text-[10px] font-mono text-[var(--muted)]">
                    ({slots.filter((s) => s?.file && !s.file.isStarterPlaceholder).length})
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) addImages(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>

                <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] text-xs font-semibold text-[var(--text)] hover:text-[var(--text-pure)] cursor-pointer transition">
                  <Volume2 className="w-3 h-3 text-[var(--cyan)]" />
                  <span className="truncate max-w-[100px]">
                    {audioFile && audioFile.name !== "timeline_guide_track.wav"
                      ? audioFile.name
                      : isAr
                      ? "+ صوت"
                      : "+ Audio"}
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) onAudio(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleSyncClipsEvenly}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] text-xs font-semibold text-[var(--text)] hover:text-[var(--text-pure)] transition"
                  title={isAr ? "توزيع المشاهد بالتساوي على طول الصوت" : "Evenly sync scenes across audio duration"}
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>{isAr ? "مزامنة" : "Sync"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Zone 3: Utilities & Primary Export CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Global Studio Undo / Redo */}
            <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg)] border border-[var(--line)]">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-[var(--muted)] hover:text-white disabled:opacity-30 disabled:hover:text-[var(--muted)] disabled:cursor-not-allowed transition"
                title={isAr ? "تراجع عن آخر عملية (Ctrl+Z)" : "Undo (Ctrl+Z)"}
                aria-label="Undo"
              >
                <Undo2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">{isAr ? "تراجع" : "Undo"}</span>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-[var(--muted)] hover:text-white disabled:opacity-30 disabled:hover:text-[var(--muted)] disabled:cursor-not-allowed transition"
                title={isAr ? "إعادة العملية (Ctrl+Y)" : "Redo (Ctrl+Y)"}
                aria-label="Redo"
              >
                <Redo2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">{isAr ? "إعادة" : "Redo"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={openNewProjectModal}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text-pure)] text-xs font-semibold transition"
              title={isAr ? "مشروع جديد (Ctrl+N)" : "Create New Project"}
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>{isAr ? "جديد" : "New"}</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text-pure)] transition"
              title={isAr ? "تغيير المظهر" : "Toggle Theme"}
            >
              {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setUiLang(uiLang === "en" ? "ar" : "en")}
              className="px-2.5 py-1 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] text-[var(--text-pure)] text-xs font-bold transition font-mono"
              title="Language / اللغة"
            >
              {uiLang === "en" ? "عربي" : "EN"}
            </button>

            {wcBusy || busy ? (
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-300 font-mono text-xs font-bold transition animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.3)] cursor-pointer"
                title={isAr ? "انقر لعرض نافذة التصدير والنسبة" : "Click to view export progress"}
              >
                <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span className="tabular-nums font-bold">
                  {Math.round((wcBusy ? wcProgress : progress) * 100)}%
                </span>
                <span className="hidden md:inline font-sans font-semibold">
                  {isAr ? "جاري التصدير..." : "Exporting..."}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition shadow-[0_2px_12px_rgba(59,130,246,0.35)]"
                title={isAr ? "تصدير الفيديو MP4" : "Export & Render MP4"}
              >
                <Film className="w-3.5 h-3.5" />
                <span>{isAr ? "تصدير MP4" : "Export MP4"}</span>
              </button>
            )}
          </div>
        </header>

        {/* Portal Body */}
        {activePortal === "channels" ? (
          <div className="uyns-content-scroll flex-1 overflow-y-auto p-4 sm:p-6">
            <ChannelsView
              globalSettings={globalSettings}
              onSaveGlobalSettings={handleSaveGlobalSettings}
              activeChannelId={activeChannel?.id}
              onSelectChannelId={(chId) => {
                setSelectedChannelId(chId);
                const ch = channels.find((c) => c.id === chId);
                if (ch) applyChannelEditorPresets(ch, false);
              }}
              onApplyToEditor={(channel) => {
                applyChannelEditorPresets(channel, true);
                setActivePortal("editor");
              }}
              onBack={() => setActivePortal("editor")}
              uiLang={uiLang}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-[var(--bg)]">
            <Editor
                clips={clips}
                imageEls={imageEls}
                audioUrl={audioUrl}
                duration={audioDuration}
                peaks={peaks}
                dims={dims}
                aspect={aspect}
                setAspect={setAspect}
                fps={fps}
                setFps={setFps}
                renderQuality={renderQuality}
                setRenderQuality={setRenderQuality}
                renderDims={renderDims}
                onWebCodecsTest={onWebCodecsTest}
                onWebCodecsCancel={onWebCodecsCancel}
                wcBusy={wcBusy}
                wcProgress={wcProgress}
                wcPhase={wcPhase}
                wcAvailable={wcOk}
                serverAvailable={serverAvailable}
                wcEnabled={wcEnabled}
                setWcEnabled={setWcEnabled}
                onRender={onRender}
                onCancel={onCancel}
                busy={busy}
                progress={progress}
                outUrl={outUrl}
                error={error}
                warnings={warnings}
                replaceImage={replaceImage}
                removeImage={removeImage}
                fillGap={fillGap}
                resizeBoundary={resizeBoundary}
                transitionsByName={transitionsByName}
                transitionDuration={transitionDuration}
                setTransition={setTransition}
                applyTransitionAll={applyTransitionAll}
                applyTransitionMix={applyTransitionMix}
                setTransitionDuration={setTransitionDuration}
                fadeIn={fadeIn}
                setFadeIn={setFadeIn}
                effectId={effectId}
                setEffectId={setEffectId}
                effectIntensity={effectIntensity}
                setEffectIntensity={setEffectIntensity}
                fadeOut={fadeOut}
                setFadeOut={setFadeOut}
                motionByName={motionByName}
                setMotion={setMotion}
                effectByName={effectByName}
                setClipEffect={setClipEffect}
                removeClipEffect={removeClipEffect}
                sfx={sfx}
                sfxResolved={sfxResolved}
                sfxUploads={sfxUploads}
                selectedSound={selectedSound}
                setSelectedSound={setSelectedSound}
                addSfx={addSfx}
                moveSfx={moveSfx}
                setSfxVolume={setSfxVolume}
                removeSfx={removeSfx}
                uploadSfx={uploadSfx}
                applyMotionAll={applyMotionAll}
                applyMotionAlternate={applyMotionAlternate}
                motionAmount={motionAmount}
                setMotionAmount={setMotionAmount}
                videoInfoByName={videoInfoByName}
                trimByName={trimByName}
                setTrim={setTrim}
                volumeByName={volumeByName}
                setVolume={setVolume}
                fitByName={fitByName}
                setFit={setFit}
                speedByName={speedByName}
                setClipSpeed={setClipSpeed}
                onSplitClip={splitClipAtTime}
                audioSpeed={audioSpeed}
                onAudioSpeedChange={handleAudioSpeedChange}
                onAudioTrim={handleAudioTrim}
                audioFile={audioFile}
                trimEnd={exportDuration}
                setTrimEnd={setTrimEnd}
                exportDuration={exportDuration}
                undo={handleUndo}
                redo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                captionCues={captionCues}
                captionsOn={captionsOn}
                setCaptionsOn={setCaptionsOn}
                captionStyle={captionStyle}
                setCaptionStyle={setCaptionStyle}
                captionColor={captionColor}
                setCaptionColor={setCaptionColor}
                captionAnimation={captionAnimation}
                setCaptionAnimation={setCaptionAnimation}
                captionSize={captionSize}
                setCaptionSize={setCaptionSize}
                captionLineHeight={captionLineHeight}
                setCaptionLineHeight={setCaptionLineHeight}
                captionFontScale={captionFontScale}
                setCaptionFontScale={setCaptionFontScale}
                captionSingleLine={captionSingleLine}
                setCaptionSingleLine={setCaptionSingleLine}
                captionFont={captionFont}
                setCaptionFont={setCaptionFont}
                captionPosition={captionPosition}
                setCaptionPosition={setCaptionPosition}
                captionEffects={captionEffects}
                setCaptionEffects={setCaptionEffects}
                captionEffectsOn={captionEffectsOn}
                setCaptionEffectsOn={setCaptionEffectsOn}
                captionName={captionName}
                captionError={captionError}
                onCaptionFile={onCaptionFile}
                activeTab={editorTab}
                onTabChange={setEditorTab}
                openExportModal={() => setIsExportModalOpen(true)}
              />
          </div>
        )}
      </div>

      {/* Studio New Project Modal */}
      {newProjectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(5, 8, 15, 0.78)", backdropFilter: "blur(6px)" }}
          onClick={() => setNewProjectModalOpen(false)}
        >
          <form
            onSubmit={handleCreateNewProject}
            onClick={(e) => e.stopPropagation()}
            dir={isAr ? "rtl" : "ltr"}
            className="w-full max-w-md rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-2xl flex flex-col gap-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/35 flex items-center justify-center text-[var(--accent)]">
                  <FilePlus2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-[var(--text-pure)]">
                    {isAr ? "إنشاء مشروع فيديو جديد" : "Create New Video Project"}
                  </h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    {isAr
                      ? "تجهيز مساحة عمل نظيفة وتطبيق ستايل القناة المختارة"
                      : "Start a clean timeline and apply your channel style preset"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewProjectModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--elev)] border border-[var(--line)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text-pure)] transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Project Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--text)]">
                {isAr ? "اسم المشروع (يُستخدم لملف التصدير MP4)" : "Project Name (used for MP4 filename)"}
              </label>
              <input
                type="text"
                autoFocus
                value={newProjectForm.title}
                onChange={(e) => setNewProjectForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={isAr ? "مثال: وثائقي الفضاء #2" : "e.g., Documentary Episode #2"}
                className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)] px-3 py-2 text-xs font-bold text-[var(--text-pure)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Channel Style Preset Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--text)]">
                {isAr ? "اختيار القناة والستايل (الكابشن والانتقالات والفلاتر)" : "Channel Style Preset"}
              </label>
              <select
                value={newProjectForm.channelId}
                onChange={(e) => {
                  const chId = e.target.value;
                  const ch = channels.find((c) => c.id === chId);
                  setNewProjectForm((prev) => ({
                    ...prev,
                    channelId: chId,
                    aspectRatio: ch?.aspectRatio || prev.aspectRatio,
                  }));
                }}
                className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)] px-3 py-2 text-xs font-bold text-[var(--text-pure)] outline-none focus:border-[var(--accent)]"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.aspectRatio || "16:9"})
                  </option>
                ))}
              </select>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--text)]">
                {isAr ? "أبعاد الفيديو (Aspect Ratio)" : "Video Aspect Ratio"}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewProjectForm((prev) => ({ ...prev, aspectRatio: "16:9" }))}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-extrabold transition-all ${
                    newProjectForm.aspectRatio === "16:9"
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-pure)]"
                      : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]"
                  }`}
                >
                  <Monitor className="w-4 h-4 text-[var(--accent)]" />
                  <span>16:9 YouTube</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewProjectForm((prev) => ({ ...prev, aspectRatio: "9:16" }))}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-extrabold transition-all ${
                    newProjectForm.aspectRatio === "9:16"
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-pure)]"
                      : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]"
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-[var(--emerald)]" />
                  <span>9:16 Shorts / Reels</span>
                </button>
              </div>
            </div>

            {/* Initial Guide Duration */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--text)]">
                {isAr
                  ? "المدة المبدئية للتايم لاين (تتحدث تلقائياً عند رفع التعليق الصوتي)"
                  : "Initial Timeline Guide Duration (auto-updates on audio upload)"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 60].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setNewProjectForm((prev) => ({ ...prev, durationSec: sec }))}
                    className={`rounded-lg border py-1.5 text-xs font-bold transition-all ${
                      newProjectForm.durationSec === sec
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-pure)]"
                        : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setNewProjectModalOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] hover:bg-[var(--elev)] px-4 py-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text-pure)] transition-colors"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-4 py-2 text-xs font-extrabold text-white shadow-lg transition-all"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>{isAr ? "بدء مشروع جديد الآن ✓" : "Create New Project ✓"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
