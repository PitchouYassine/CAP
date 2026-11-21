"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Timeline from "./Timeline";
import { transitionOf } from "../lib/transitions";
import { applyEffect } from "../lib/effects";
import { preloadSfx, fireSfx, stopAllSfx, resumeSfx } from "../lib/sfxScheduler";
import AudioPanel from "./panels/AudioPanel";
import { captionCueAt, drawCaption, captionFontPx, captionFontFamily, drawCaptionOverlay } from "../lib/captions";
import { tc } from "../lib/format";
import ExportPanel from "./panels/ExportPanel";
import TransitionsPanel from "./panels/TransitionsPanel";
import MotionPanel from "./panels/MotionPanel";
import CaptionsPanel from "./panels/CaptionsPanel";
import InspectorModal from "./InspectorModal";
import EffectsPanel from "./panels/EffectsPanel";
import LeftPanel from "./LeftPanel";
import {
  Type,
  Sparkles,
  Layers,
  Move,
  Volume2,
  Download,
  Play,
  Pause,
  SkipBack,
  Undo2,
  Redo2,
  Monitor,
  Smartphone,
  Film,
  Scissors,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export default function Editor({
  clips, imageEls, audioUrl, duration, peaks, dims,
  aspect, setAspect, fps, setFps,
  renderQuality = "full", setRenderQuality, renderDims,
  onRender, onCancel, busy, progress, outUrl, error, warnings,
  onWebCodecsTest, onWebCodecsCancel, wcBusy, wcProgress, wcPhase, wcAvailable, serverAvailable, wcEnabled, setWcEnabled,
  replaceImage, removeImage, fillGap, resizeBoundary,
  transitionsByName, transitionDuration, setTransition, applyTransitionAll, applyTransitionMix, setTransitionDuration,
  fadeIn, setFadeIn, fadeOut, setFadeOut,
  effectId, setEffectId, effectIntensity, setEffectIntensity,
  effectByName = {}, setClipEffect, removeClipEffect,
  sfx = [], sfxResolved = [], sfxUploads = [], selectedSound, setSelectedSound,
  addSfx, moveSfx, setSfxVolume, removeSfx, uploadSfx,
  motionByName, setMotion, applyMotionAll, applyMotionAlternate, motionAmount, setMotionAmount,
  videoInfoByName = {}, trimByName = {}, setTrim, volumeByName = {}, setVolume,
  fitByName = {}, setFit,
  speedByName = {}, setClipSpeed, onSplitClip,
  audioSpeed = 1.0, onAudioSpeedChange, onAudioTrim, audioFile,
  trimEnd, setTrimEnd, exportDuration,
  undo, redo, canUndo, canRedo,
  captionCues, captionsOn, setCaptionsOn, captionStyle, setCaptionStyle,
  captionColor = "#FFFFFF", setCaptionColor,
  captionAnimation = "pop", setCaptionAnimation,
  captionSize, setCaptionSize, captionLineHeight, setCaptionLineHeight,
  captionFontScale, setCaptionFontScale,
  captionSingleLine = false, setCaptionSingleLine,
  captionFont, setCaptionFont, captionPosition, setCaptionPosition,
  captionEffects = [], setCaptionEffects,
  captionEffectsOn = true, setCaptionEffectsOn,
  captionName, captionError, onCaptionFile,
  activeTab, onTabChange,
  openExportModal,
}) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const fileInputRef = useRef(null);
  const pending = useRef(null);
  const trimEndRef = useRef(exportDuration);
  const vidRefs = useRef({});
  const drawRef = useRef(null);
  const timeRef = useRef(0);
  useEffect(() => { trimEndRef.current = exportDuration; }, [exportDuration]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedCut, setSelectedCut] = useState(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState(null);
  const [currentType, setCurrentType] = useState("fade");
  const [inspect, setInspect] = useState(null);
  const [dismissedWarn, setDismissedWarn] = useState(() => new Set());
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    try { setCoarse(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch { /* ignore */ }
  }, []);

  const editorRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeToolId, setActiveToolId] = useState(activeTab || "captions");
  useEffect(() => {
    if (activeTab) setActiveToolId(activeTab);
  }, [activeTab]);

  const [drawerW, setDrawerW] = useState(() => {
    try {
      const v = +localStorage.getItem("ae-drawer-w");
      if (v >= 280 && v <= 560) return v;
    } catch { /* ignore */ }
    return 350;
  });
  const draggingRef = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem("ae-drawer-w", String(Math.round(drawerW)));
    } catch { /* ignore */ }
  }, [drawerW]);

  const onResizeDown = useCallback((e) => {
    draggingRef.current = true;
    e.currentTarget.classList.add("is-drag");
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);
  const onResizeMove = useCallback((e) => {
    if (!draggingRef.current || !editorRef.current) return;
    const r = editorRef.current.getBoundingClientRect();
    let x = e.clientX - r.left - 64; // subtract 64px Activity Rail
    x = Math.max(280, Math.min(560, x));
    setDrawerW(x);
  }, []);
  const onResizeUp = useCallback((e) => {
    draggingRef.current = false;
    e.currentTarget.classList.remove("is-drag");
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const handleRailClick = useCallback((id) => {
    if (activeToolId === id) {
      setDrawerOpen((prev) => !prev);
    } else {
      setActiveToolId(id);
      setDrawerOpen(true);
      if (onTabChange) onTabChange(id);
    }
  }, [activeToolId, onTabChange]);

  const askAdd = useCallback((name) => {
    pending.current = name;
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const onPickFile = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file && pending.current && fillGap) fillGap(pending.current, file);
    e.target.value = "";
    pending.current = null;
  }, [fillGap]);

  const openInspect = useCallback((name) => setInspect(name), []);
  const closeInspect = useCallback(() => setInspect(null), []);

  useEffect(() => {
    const map = vidRefs.current;
    for (const [name, info] of Object.entries(videoInfoByName)) {
      if (!map[name] && info && info.url) {
        const v = document.createElement("video");
        v.src = info.url; v.muted = true; v.playsInline = true; v.preload = "auto";
        const redraw = () => { if (drawRef.current) drawRef.current(timeRef.current); };
        v.addEventListener("seeked", redraw);
        v.addEventListener("loadeddata", redraw);
        map[name] = v;
      }
    }
    for (const name of Object.keys(map)) {
      if (!videoInfoByName[name]) { try { map[name].pause(); } catch { /* ignore */ } delete map[name]; }
    }
  }, [videoInfoByName]);

  const videoParams = useCallback((name, slotDur) => {
    const info = videoInfoByName[name];
    if (!info) return null;
    const dur = info.duration || 0;
    const customSp = speedByName && speedByName[name];
    if (customSp != null && customSp > 0) {
      return { trimStart: trimByName[name] || 0, speed: customSp };
    }
    const mode = fitByName[name] || (dur > slotDur ? "trim" : "fit");
    if (mode === "fit" && slotDur > 0 && dur > 0 && Math.abs(dur - slotDur) > 0.05) return { trimStart: 0, speed: dur / slotDur };
    return { trimStart: trimByName[name] || 0, speed: 1 };
  }, [videoInfoByName, fitByName, trimByName, speedByName]);

  const draw = useCallback((t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    let activeVideo = null;

    const scaleAt = (ci, tt) => {
      const c = clips[ci];
      if (!c || c.gap) return 1;
      const m = (motionByName && motionByName[c.name]) || "none";
      if (m === "none") return 1;
      const lp = Math.min(1, Math.max(0, (tt - c.start) / c.duration));
      return m === "zoomout" ? 1 + motionAmount * (1 - lp) : 1 + motionAmount * lp;
    };

    const primeVideo = (c, tt, wantDraw) => {
      const vinfo = videoInfoByName[c.name];
      if (!vinfo) return null;
      const v = vidRefs.current[c.name];
      const pr = videoParams(c.name, c.duration);
      if (!v || !pr) return null;
      const srcTime = Math.min(vinfo.duration || 0, Math.max(0, pr.trimStart + (tt - c.start) * pr.speed));
      const clipVol = volumeByName[c.name] == null ? 0.5 : volumeByName[c.name];
      v.volume = Math.min(1, Math.max(0, clipVol));
      v.muted = clipVol <= 0;
      v.playbackRate = Math.min(16, Math.max(0.0625, pr.speed));
      if (v.paused) { try { v.currentTime = srcTime; } catch { /* ignore */ } v.play().catch(() => {}); }
      else if (Math.abs(v.currentTime - srcTime) > 0.6) { try { v.currentTime = srcTime; } catch { /* ignore */ } }
      activeVideo = c.name;
      return (wantDraw && v.readyState >= 2 && !v.seeking) ? v : null;
    };

    if (clips.length) {
      let idx = clips.findIndex((c) => t >= c.start && t < c.start + c.duration);
      if (idx === -1) idx = clips.length - 1;
      const clip = clips[idx];
      const type = idx > 0 ? (transitionsByName[clip.name] || "cut") : "cut";
      const tdur = type === "cut" ? 0 : Math.min(transitionDuration, clip.duration);

      if (idx > 0 && tdur > 0 && t < clip.start + tdur) {
        const p = Math.min(1, Math.max(0, (t - clip.start) / tdur));
        transitionOf(type).canvas(
          ctx, imageEls[clips[idx - 1].name] || null, imageEls[clip.name] || null, p, W, H,
          scaleAt(idx - 1, t), scaleAt(idx, t)
        );
        ctx.globalAlpha = 1;
        if (playing) primeVideo(clip, t, false);
      } else {
        let drawable = imageEls[clip.name];
        if (playing) { const vEl = primeVideo(clip, t, true); if (vEl) drawable = vEl; }
        const dw = (drawable && (drawable.videoWidth || drawable.naturalWidth)) || 0;
        const dh = (drawable && (drawable.videoHeight || drawable.naturalHeight)) || 0;
        if (drawable && dw && dh) {
          const scale = Math.max(W / dw, H / dh) * scaleAt(idx, t);
          const w = dw * scale, h = dh * scale;
          ctx.drawImage(drawable, (W - w) / 2, (H - h) / 2, w, h);
        }
      }
    }

    for (const [nm, v] of Object.entries(vidRefs.current)) {
      if (nm !== activeVideo && !v.paused) { try { v.pause(); } catch { /* ignore */ } }
    }

    const fxClip = clips.find((c) => t >= c.start && t < c.start + c.duration) || clips[clips.length - 1];
    const ov = fxClip && effectByName[fxClip.name];
    applyEffect(ctx, ov ? ov.id : effectId, ov ? ov.intensity : effectIntensity, W, H, t);

    if (captionsOn && captionCues && captionCues.length) {
      const cue = captionCueAt(captionCues, t);
      if (cue) {
        drawCaption(
          ctx,
          cue.text,
          W,
          H,
          captionStyle,
          captionFontPx(H, captionSize, captionFontScale),
          captionLineHeight,
          captionFontFamily(captionFont),
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

    if (captionEffectsOn !== false && captionEffects && captionEffects.length) {
      const capFamily = captionFontFamily(captionFont);
      const activeClip = clips.find((c) => t >= c.start && t < c.start + c.duration) || clips[0];
      const activeImg = activeClip ? imageEls[activeClip.name] : null;
      const sceneCtx = { activeImg, aspect, clipName: activeClip?.name };

      for (const ovItem of captionEffects) {
        if (ovItem.approved !== false && t >= ovItem.start && t < ovItem.end) {
          drawCaptionOverlay(ctx, ovItem, W, H, t, capFamily, sceneCtx);
        }
      }
    }

    if (fadeIn > 0 && t < fadeIn) {
      ctx.globalAlpha = Math.max(0, 1 - t / fadeIn);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    const outStart = exportDuration - fadeOut;
    if (fadeOut > 0 && t > outStart) {
      ctx.globalAlpha = Math.min(1, (t - outStart) / fadeOut);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }, [clips, imageEls, transitionsByName, transitionDuration, motionByName, motionAmount,
      fadeIn, fadeOut, effectId, effectIntensity, effectByName, duration, exportDuration, playing, videoInfoByName, videoParams, volumeByName,
      captionsOn, captionCues, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionSingleLine,
      captionFont, captionPosition, captionEffects, captionEffectsOn, aspect]);

  useEffect(() => { drawRef.current = draw; }, [draw]);
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => { draw(time); }, [time, draw]);
  useEffect(() => { setTime(0); }, [audioUrl]);

  useEffect(() => {
    if (!busy && !wcBusy) { setElapsed(0); return; }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(id);
  }, [busy, wcBusy]);

  const sfxRef = useRef(sfxResolved);
  useEffect(() => { sfxRef.current = sfxResolved; }, [sfxResolved]);
  const prevSfxTimeRef = useRef(0);
  const [sfxEdit, setSfxEdit] = useState(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const loop = () => {
      const end = trimEndRef.current;
      if (end > 0 && a.currentTime >= end) {
        a.pause();
        a.currentTime = end;
        setTime(end);
        return;
      }
      const cur = a.currentTime, prev = prevSfxTimeRef.current;
      if (cur >= prev) {
        for (const s of sfxRef.current) {
          if (s.url && s.at > prev && s.at <= cur) fireSfx(s.url, s.volume);
        }
      }
      prevSfxTimeRef.current = cur;
      setTime(cur);
      rafRef.current = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      resumeSfx();
      preloadSfx(sfxRef.current.map((s) => s.url));
      prevSfxTimeRef.current = a.currentTime;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    const onStop = () => { setPlaying(false); cancelAnimationFrame(rafRef.current); stopAllSfx(); setTime(a.currentTime); };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioUrl]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      try { a.pause(); } catch (_) {}
    }
  }, []);

  const pendingSeekRef = useRef(null);
  const seek = useCallback((t) => {
    const a = audioRef.current;
    if (!a) return;
    const c = Math.min(Math.max(t, 0), duration || t || 0);
    setTime(c);
    stopAllSfx();
    prevSfxTimeRef.current = c;
    if (a.seeking) pendingSeekRef.current = c;
    else { pendingSeekRef.current = null; try { a.currentTime = c; } catch (_) {} }
  }, [duration]);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onSeeked = () => {
      const p = pendingSeekRef.current;
      if (p != null) { pendingSeekRef.current = null; if (Math.abs(a.currentTime - p) > 0.02) { try { a.currentTime = p; } catch (_) {} } }
    };
    a.addEventListener("seeked", onSeeked);
    return () => a.removeEventListener("seeked", onSeeked);
  }, [audioUrl]);

  const scrubResumeRef = useRef(false);
  const onScrubStart = useCallback(() => {
    const a = audioRef.current;
    scrubResumeRef.current = !!(a && !a.paused);
    if (a && !a.paused) { try { a.pause(); } catch (_) {} }
    stopAllSfx();
  }, []);
  const onScrubEnd = useCallback(() => {
    const a = audioRef.current;
    if (a && scrubResumeRef.current) { scrubResumeRef.current = false; a.play().catch(() => {}); }
  }, []);

  const active = clips.find((c) => time >= c.start && time < c.start + c.duration) || clips[clips.length - 1];
  const badClips = useMemo(
    () => new Set(clips.filter((c) => c.duration <= 0.0001).map((c) => c.name)),
    [clips]
  );
  const imageClips = useMemo(() => clips.filter((c) => !c.gap), [clips]);
  const imageCount = imageClips.length;
  const gapCount = clips.length - imageCount;
  const activeIndex = active && !active.gap ? imageClips.indexOf(active) + 1 : 0;

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      // Undo / Redo
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) { if (canRedo && redo) redo(); }
          else { if (canUndo && undo) undo(); }
          return;
        }
        if (k === "y") {
          e.preventDefault();
          if (canRedo && redo) redo();
          return;
        }
      }

      // Space: Play / Pause toggle
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
      // 'S' key: Professional Split / Razor Blade tool at current playhead
      else if (e.key === "s" || e.key === "S" || e.key === "س") {
        e.preventDefault();
        if (onSplitClip) onSplitClip(time);
      }
      // 'Delete' / 'Backspace': Delete currently selected or active clip (Ripple delete)
      else if (e.key === "Delete" || e.key === "Backspace") {
        const targetId = selectedCut || (active && !active.gap ? active.name : null);
        if (targetId && removeImage) {
          e.preventDefault();
          removeImage(targetId);
        }
      }
      // J / K / L broadcast shuttle controls:
      // K: Pause
      else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const a = audioRef.current;
        if (a && !a.paused) { try { a.pause(); } catch (_) {} }
      }
      // L: Play forward
      else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        const a = audioRef.current;
        if (a && a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
      }
      // J: Step backward
      else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        seek(Math.max(0, time - 1));
      }
      // Precise frame scrubbing: Left / Right arrows
      else if (e.code === "ArrowRight") {
        e.preventDefault();
        seek(time + (e.shiftKey ? 2 : 1 / fps));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, time - (e.shiftKey ? 2 : 1 / fps)));
      } else if (e.key === "Home") {
        e.preventDefault();
        seek(0);
      } else if (e.key === "End") {
        e.preventDefault();
        seek(exportDuration);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, time, undo, redo, canUndo, canRedo, onSplitClip, selectedCut, active, removeImage, fps, exportDuration]);

  const selectClip = useCallback((name) => {
    setSelectedCut(name);
    setCurrentType(transitionsByName[name] || "cut");
  }, [transitionsByName]);

  const pickType = useCallback((type) => {
    setCurrentType(type);
    if (selectedCut) setTransition(selectedCut, type);
  }, [selectedCut, setTransition]);

  const selectedClip = selectedCut && clips.find((c) => c.name === selectedCut);
  const selectedIndex = selectedClip ? clips.indexOf(selectedClip) : -1;
  const selectedImageNum = selectedClip && !selectedClip.gap ? imageClips.indexOf(selectedClip) + 1 : 0;

  const applyFilterAll = useCallback((id, intensity) => {
    setEffectId(id);
    setEffectIntensity(intensity);
    if (clips && removeClipEffect) {
      for (const c of clips) {
        removeClipEffect(c.name);
      }
    }
  }, [clips, setEffectId, setEffectIntensity, removeClipEffect]);

  const tools = useMemo(
    () => [
      {
        id: "captions",
        icon: <Type className="w-5 h-5" />,
        label: "Captions",
        title: "Captions & AI Text Effects / نصوص وترجمة الفيديو",
        node: (
          <CaptionsPanel
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
            onSeek={seek}
            currentTime={time}
            selectedOverlayId={selectedOverlayId}
            setSelectedOverlayId={setSelectedOverlayId}
            captionName={captionName}
            captionError={captionError}
            onCaptionFile={onCaptionFile}
          />
        ),
      },
      {
        id: "effects",
        icon: <Sparkles className="w-5 h-5" />,
        label: "Filters",
        title: "Color Grading & Atmosphere / فلاتر الألوان والتأثيرات",
        node: (
          <EffectsPanel
            effectId={effectId}
            setEffectId={setEffectId}
            effectIntensity={effectIntensity}
            setEffectIntensity={setEffectIntensity}
            applyFilterAll={applyFilterAll}
          />
        ),
      },
      {
        id: "transitions",
        icon: <Layers className="w-5 h-5" />,
        label: "Transitions",
        title: "Cinematic Transitions / الانتقالات",
        node: (
          <TransitionsPanel
            clips={clips}
            selectedIndex={selectedIndex}
            selectedClip={selectedClip}
            selectedImageNum={selectedImageNum}
            currentType={currentType}
            pickType={pickType}
            transitionDuration={transitionDuration}
            setTransitionDuration={setTransitionDuration}
            applyTransitionAll={applyTransitionAll}
            applyTransitionMix={applyTransitionMix}
          />
        ),
      },
      {
        id: "motion",
        icon: <Move className="w-5 h-5" />,
        label: "Motion",
        title: "Ken Burns Zoom & Fades / الحركة والزوم",
        node: (
          <MotionPanel
            imageClips={imageClips}
            motionByName={motionByName}
            motionAmount={motionAmount}
            setMotionAmount={setMotionAmount}
            applyMotionAll={applyMotionAll}
            applyMotionAlternate={applyMotionAlternate}
            fadeIn={fadeIn}
            setFadeIn={setFadeIn}
            fadeOut={fadeOut}
            setFadeOut={setFadeOut}
          />
        ),
      },
      {
        id: "audio",
        icon: <Volume2 className="w-5 h-5" />,
        label: "Audio",
        title: "Sound Effects & Audio / المؤثرات الصوتية والتعليق",
        node: (
          <AudioPanel
            selectedSound={selectedSound}
            setSelectedSound={setSelectedSound}
            sfxUploads={sfxUploads}
            uploadSfx={uploadSfx}
            audioDuration={duration}
            audioSpeed={audioSpeed}
            onAudioSpeedChange={onAudioSpeedChange}
            onAudioTrim={onAudioTrim}
            audioFile={audioFile}
          />
        ),
      },
      {
        id: "export",
        icon: <Download className="w-5 h-5" />,
        label: "Export",
        title: "Render & Export MP4 / تصدير الفيديو",
        node: (
          <ExportPanel
            aspect={aspect}
            setAspect={setAspect}
            fps={fps}
            setFps={setFps}
            renderQuality={renderQuality}
            setRenderQuality={setRenderQuality}
            renderDims={renderDims}
            dims={dims}
            imageCount={imageCount}
            gapCount={gapCount}
            exportDuration={exportDuration}
            duration={duration}
            elapsed={elapsed}
            wcAvailable={wcAvailable}
            serverAvailable={serverAvailable}
            busy={busy}
            wcBusy={wcBusy}
            wcPhase={wcPhase}
            wcProgress={wcProgress}
            progress={progress}
            wcEnabled={wcEnabled}
            setWcEnabled={setWcEnabled}
            onWebCodecsTest={onWebCodecsTest}
            onRender={onRender}
            onWebCodecsCancel={onWebCodecsCancel}
            onCancel={onCancel}
            outUrl={outUrl}
            error={error}
          />
        ),
      },
    ],
    [
      captionCues,
      captionsOn,
      setCaptionsOn,
      captionStyle,
      setCaptionStyle,
      captionColor,
      setCaptionColor,
      captionAnimation,
      setCaptionAnimation,
      captionSize,
      setCaptionSize,
      captionLineHeight,
      setCaptionLineHeight,
      captionFontScale,
      setCaptionFontScale,
      captionSingleLine,
      setCaptionSingleLine,
      captionFont,
      setCaptionFont,
      captionPosition,
      setCaptionPosition,
      captionEffects,
      setCaptionEffects,
      captionEffectsOn,
      setCaptionEffectsOn,
      seek,
      time,
      selectedOverlayId,
      setSelectedOverlayId,
      captionName,
      captionError,
      onCaptionFile,
      effectId,
      setEffectId,
      effectIntensity,
      setEffectIntensity,
      applyFilterAll,
      clips,
      selectedIndex,
      selectedClip,
      selectedImageNum,
      currentType,
      pickType,
      transitionDuration,
      setTransitionDuration,
      applyTransitionAll,
      applyTransitionMix,
      imageClips,
      motionByName,
      motionAmount,
      setMotionAmount,
      applyMotionAll,
      applyMotionAlternate,
      fadeIn,
      setFadeIn,
      fadeOut,
      setFadeOut,
      selectedSound,
      setSelectedSound,
      sfxUploads,
      uploadSfx,
      duration,
      audioSpeed,
      onAudioSpeedChange,
      onAudioTrim,
      audioFile,
      aspect,
      setAspect,
      fps,
      setFps,
      renderQuality,
      setRenderQuality,
      renderDims,
      dims,
      imageCount,
      gapCount,
      exportDuration,
      elapsed,
      wcAvailable,
      serverAvailable,
      busy,
      wcBusy,
      wcPhase,
      wcProgress,
      progress,
      wcEnabled,
      setWcEnabled,
      onWebCodecsTest,
      onRender,
      onWebCodecsCancel,
      onCancel,
      outUrl,
      error,
    ]
  );

  const currentTool = useMemo(
    () => tools.find((t) => t.id === activeToolId) || tools[0],
    [tools, activeToolId]
  );

  return (
    <section className="nle-workstation" ref={editorRef} dir="ltr">
      {/* 1. Sleek 64px Activity Rail */}
      <nav className="activity-rail" aria-label="Tool Activity Rail">
        <div className="activity-rail__top">
          {tools.map((t) => {
            const isActive = activeToolId === t.id && drawerOpen;
            return (
              <button
                key={t.id}
                type="button"
                className={`rail-btn ${isActive ? "is-active" : ""}`}
                onClick={() => handleRailClick(t.id)}
                title={t.title || t.label}
                aria-pressed={isActive}
              >
                <span className="rail-btn__icon">{t.icon}</span>
                <span className="rail-btn__label">{t.label}</span>
                {isActive && <span className="rail-btn__bar" />}
              </button>
            );
          })}
        </div>

        <div className="activity-rail__bottom">
          <button
            type="button"
            className="rail-btn"
            onClick={() => setDrawerOpen((prev) => !prev)}
            title={drawerOpen ? "Collapse Panel" : "Open Panel"}
          >
            <span className="rail-btn__icon">
              {drawerOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </span>
            <span className="rail-btn__label">{drawerOpen ? "Close" : "Tools"}</span>
          </button>
        </div>
      </nav>

      {/* 2. Collapsible Tool Drawer */}
      {drawerOpen && (
        <aside className="tool-drawer" style={{ width: `${drawerW}px` }}>
          <div className="drawer-header">
            <div className="drawer-header__title">
              <span className="text-[var(--accent)]">{currentTool?.icon}</span>
              <span className="font-extrabold text-xs tracking-wide uppercase text-[var(--text-pure)]">
                {currentTool?.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="drawer-action-btn"
                onClick={() => setDrawerW((prev) => (prev > 400 ? 340 : 490))}
                title={drawerW > 400 ? "Compact Width" : "Expand Width"}
              >
                {drawerW > 400 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                className="drawer-action-btn"
                onClick={() => setDrawerOpen(false)}
                title="Collapse Drawer (Esc)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="drawer-body">
            {currentTool ? currentTool.node : null}
          </div>
          <div
            className="drawer-resizer"
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize tools drawer"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </aside>
      )}

      {/* 3. Center Creative Workstation (Program Monitor Stage + Full-Width Timeline) */}
      <main className="stage-area">
        {/* Top: Expansive Program Monitor */}
        <div className="monitor-stage">
          {/* Cinema Top Strip */}
          <div className="monitor-topbar">
            <div className="flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="font-bold text-xs text-[var(--text-pure)]">Program Monitor</span>
              <span className="text-[var(--faint)]">·</span>
              <span className="font-mono text-xs text-[var(--muted)]">
                {active?.gap ? "Empty Gap" : `Scene ${activeIndex} / ${imageCount}`}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] text-[var(--muted)]">{dims.width}×{dims.height}</span>
              <span className="text-[var(--faint)]">·</span>
              <span className="font-mono text-[11px] text-[var(--muted)]">{fps} FPS</span>
              <span className="text-[var(--faint)]">·</span>
              <span className="font-mono text-[11px] text-[var(--accent)]">FX: {effectId || "none"}</span>
            </div>
          </div>

          {/* Hero Cinema Canvas */}
          <div className="monitor-viewport">
            <canvas ref={canvasRef} width={dims.width} height={dims.height} className="monitor-canvas" />
          </div>

          {/* Floating Glass Transport Deck */}
          <div className="floating-transport">
            <button
              type="button"
              className="transport-btn"
              onClick={() => seek(0)}
              title="First Frame (Home)"
              aria-label="First Frame"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              className="transport-btn"
              onClick={() => seek(Math.max(0, time - 1 / fps))}
              title="Step Backward 1 Frame (Left Arrow)"
              aria-label="Previous Frame"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              className="transport-hero-play"
              onClick={toggle}
              title="Play / Pause (Space)"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              type="button"
              className="transport-btn"
              onClick={() => seek(Math.min(exportDuration, time + 1 / fps))}
              title="Step Forward 1 Frame (Right Arrow)"
              aria-label="Next Frame"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Microsecond Timecode */}
            <div className="transport-timecode">
              <span className="font-mono font-bold text-xs text-[var(--text-pure)] tabular-nums">{tc(time)}</span>
              <span className="text-[var(--faint)]">/</span>
              <span className="font-mono text-xs text-[var(--muted)] tabular-nums">{tc(exportDuration)}</span>
            </div>

            {/* Split Razor Tool */}
            {onSplitClip && (
              <button
                type="button"
                className="transport-btn text-amber-400 hover:text-white"
                onClick={() => onSplitClip(time)}
                title="تقطيع وقص المقطع عند المؤشر الحالي (Split at Playhead - S)"
                aria-label="Split Clip at Playhead"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span className="hidden xl:inline text-[11px] font-semibold">Split</span>
              </button>
            )}

            {/* Aspect Ratio Switch */}
            <div className="transport-aspect-group">
              <button
                type="button"
                className={`aspect-toggle ${aspect === "16:9" ? "is-active" : ""}`}
                onClick={() => setAspect("16:9")}
                title="16:9 Landscape"
              >
                <Monitor className="w-3 h-3" />
                <span>16:9</span>
              </button>
              <button
                type="button"
                className={`aspect-toggle ${aspect === "9:16" ? "is-active" : ""}`}
                onClick={() => setAspect("9:16")}
                title="9:16 Portrait"
              >
                <Smartphone className="w-3 h-3" />
                <span>9:16</span>
              </button>
            </div>

            {/* History (Undo / Redo) */}
            <div className="transport-history">
              <button
                type="button"
                className="transport-btn"
                onClick={undo}
                disabled={!canUndo}
                title="تراجع عن آخر عملية (Ctrl+Z) / Undo"
                aria-label="Undo"
              >
                <Undo2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden xl:inline text-[11px] font-semibold">Undo</span>
              </button>
              <button
                type="button"
                className="transport-btn"
                onClick={redo}
                disabled={!canRedo}
                title="إعادة العملية (Ctrl+Y) / Redo"
                aria-label="Redo"
              >
                <Redo2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden xl:inline text-[11px] font-semibold">Redo</span>
              </button>
            </div>

            {/* Direct Export trigger */}
            <button
              type="button"
              className="transport-export-action"
              onClick={() => {
                if (openExportModal) {
                  openExportModal();
                } else {
                  setActiveToolId("export");
                  setDrawerOpen(true);
                  if (onTabChange) onTabChange("export");
                }
              }}
              title="Open Export & Render MP4 / تصدير الفيديو"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

          <audio ref={audioRef} src={audioUrl} hidden />
        </div>

        {(() => {
          const shown = warnings.filter((w) => !dismissedWarn.has(w));
          if (!shown.length) return null;
          return (
            <div className="notes notes--compact">
              {shown.length > 1 && (
                <button
                  type="button"
                  className="notes__clear"
                  onClick={() => setDismissedWarn(new Set(warnings))}
                >
                  Dismiss all ({shown.length})
                </button>
              )}
              {shown.map((w) => (
                <div className="note note--dismissable" key={w}>
                  <span>{w}</span>
                  <button
                    type="button"
                    className="note__x"
                    aria-label="Dismiss"
                    onClick={() => setDismissedWarn((prev) => new Set(prev).add(w))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Bottom: Full-Width Studio Timeline */}
        <div className="timeline-stage">
          <Timeline
            clips={clips}
            imageEls={imageEls}
            duration={duration}
            time={time}
            peaks={peaks}
            activeName={active && active.name}
            badClips={badClips}
            transitionsByName={transitionsByName}
            motionByName={motionByName}
            selectedName={selectedCut}
            onSelect={selectClip}
            onSeek={seek}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            onOpen={openInspect}
            onAdd={askAdd}
            onDeleteClip={removeImage}
            onReplaceClip={(name) => openInspect(name)}
            onResizeBoundary={resizeBoundary}
            onSplitClip={onSplitClip}
            trimEnd={trimEnd}
            onTrimChange={setTrimEnd}
            captionEffects={captionEffects}
            captionEffectsOn={captionEffectsOn}
            selectedOverlayId={selectedOverlayId}
            onOverlaySelect={(id) => {
              setSelectedOverlayId(id);
              setActiveToolId("captions");
              setDrawerOpen(true);
              if (onTabChange) onTabChange("captions");
            }}
            onOverlayMove={(id, newStart) => {
              if (!setCaptionEffects) return;
              setCaptionEffects((prev) => {
                return (prev || []).map((ov) => {
                  if (ov.id !== id) return ov;
                  const dur = Math.max(0.4, (ov.end || ov.start + 1.5) - ov.start);
                  const clampedStart = Math.max(0, Math.min(exportDuration - dur, +newStart.toFixed(2)));
                  const clampedEnd = Math.max(clampedStart + 0.3, +(clampedStart + dur).toFixed(2));
                  return { ...ov, start: clampedStart, end: clampedEnd };
                });
              });
            }}
            sfx={sfx}
            onSfxAdd={addSfx}
            onSfxMove={moveSfx}
            onSfxOpen={setSfxEdit}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>
      </main>

      <input
        ref={fileInputRef} type="file" accept={coarse ? undefined : "image/*,video/*"} hidden
        onChange={onPickFile}
      />

      <InspectorModal
        inspect={inspect} onClose={closeInspect}
        clips={clips} imageEls={imageEls} imageClips={imageClips} imageCount={imageCount}
        videoInfoByName={videoInfoByName} volumeByName={volumeByName} setVolume={setVolume}
        trimByName={trimByName} setTrim={setTrim} fitByName={fitByName} setFit={setFit}
        speedByName={speedByName} setClipSpeed={setClipSpeed} onSplitClip={onSplitClip}
        motionByName={motionByName} setMotion={setMotion}
        effectByName={effectByName} setClipEffect={setClipEffect} removeClipEffect={removeClipEffect}
        replaceImage={replaceImage} removeImage={removeImage}
        coarse={coarse}
      />

      {sfxEdit != null && (() => {
        const s = sfx.find((x) => x.id === sfxEdit);
        if (!s) return null;
        return (
          <div className="modal" role="dialog" aria-modal="true" onClick={() => setSfxEdit(null)}>
            <div className="modal__card" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal__head">
                <span className="modal__title">{s.name} <span className="modal__at">· {tc(s.at)}</span></span>
                <button className="modal__x" onClick={() => setSfxEdit(null)} aria-label="Close">✕</button>
              </div>
              <div className="modal__vol">
                <span className="modal__motion-label">Volume</span>
                <div className="modal__slider">
                  <input
                    type="range" min={0} max={1} step={0.05} value={s.volume}
                    onChange={(e) => setSfxVolume && setSfxVolume(s.id, +e.target.value)}
                  />
                  <span className="trdur__val">{Math.round(s.volume * 100)}%</span>
                </div>
              </div>
              <div className="modal__actions">
                <button className="mbtn mbtn--danger" onClick={() => { removeSfx && removeSfx(s.id); setSfxEdit(null); }}>Remove</button>
                <button className="mbtn mbtn--primary" onClick={() => setSfxEdit(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
