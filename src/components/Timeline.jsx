import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { transitionOf } from "../lib/transitions";
import {
  Scissors,
  Magnet,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Layers,
  Sparkles,
  Music,
  Video as VideoIcon,
  Type as TypeIcon,
  MousePointer,
  Slice,
  Trash2,
  Settings,
  MoreVertical,
  Sliders,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
} from "lucide-react";

function formatTC(t) {
  if (t == null || isNaN(t)) return "00:00:00:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const frames = Math.floor((t % 1) * 30);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function label(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stem(name) {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function Waveform({ peaks, color = "#06b6d4" }) {
  if (!peaks || !peaks.length) {
    return (
      <div className="w-full h-full flex items-center justify-center opacity-30 text-[10px] font-mono select-none tracking-widest">
        — NO AUDIO TRACK —
      </div>
    );
  }
  const n = peaks.length;
  return (
    <svg className="w-full h-full block" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((p, i) => {
        const h = Math.max(3, p * 88);
        return (
          <rect
            key={i}
            x={i + 0.12}
            y={(100 - h) / 2}
            width={0.76}
            height={h}
            fill={color}
            opacity={0.88}
            rx={0.3}
          />
        );
      })}
    </svg>
  );
}

export default function Timeline({
  clips = [],
  imageEls = {},
  duration = 30,
  time = 0,
  peaks = [],
  activeName,
  badClips,
  transitionsByName = {},
  motionByName = {},
  selectedName,
  onSelect,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onOpen,
  onAdd,
  onDeleteClip,
  onReplaceClip,
  onResizeBoundary,
  onSplitClip,
  trimEnd,
  onTrimChange,
  captionEffects = [],
  captionEffectsOn = true,
  selectedOverlayId,
  onOverlaySelect,
  onOverlayMove,
  sfx = [],
  onSfxAdd,
  onSfxMove,
  onSfxOpen,
  undo,
  redo,
  canUndo,
  canRedo,
}) {
  const trackRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const downRef = useRef(null);

  // NLE State
  const [zoomScale, setZoomScale] = useState(1);
  const [activeTool, setActiveTool] = useState("select"); // 'select' | 'razor'
  const [snapping, setSnapping] = useState(true);

  // Track Header states (Mute, Solo, Visibility, Lock)
  const [v1Visible, setV1Visible] = useState(true);
  const [v1Locked, setV1Locked] = useState(false);
  const [a1Muted, setA1Muted] = useState(false);
  const [a1Solo, setA1Solo] = useState(false);
  const [a1Locked, setA1Locked] = useState(false);
  const [a2Muted, setA2Muted] = useState(false);
  const [t1Visible, setT1Visible] = useState(true);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState(null);

  // Close context menu on global click
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
    };
  }, []);

  const seekAt = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el || !duration) return 0;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - r.left, 0), r.width);
      let targetSec = (x / r.width) * duration;

      if (snapping && clips.length > 0) {
        const snapDistanceSec = (8 / r.width) * duration;
        for (const c of clips) {
          if (Math.abs(c.start - targetSec) < snapDistanceSec) {
            targetSec = c.start;
            break;
          }
          if (Math.abs(c.start + c.duration - targetSec) < snapDistanceSec) {
            targetSec = c.start + c.duration;
            break;
          }
        }
      }

      const clamped = Math.max(0, Math.min(duration, targetSec));
      onSeek(clamped);
      return clamped;
    },
    [duration, onSeek, snapping, clips]
  );

  const onScrubDown = useCallback(
    (e) => {
      if (onScrubStart) onScrubStart();
      seekAt(e.clientX);
      const move = (ev) => seekAt(ev.clientX);
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        seekAt(ev.clientX);
        if (onScrubEnd) onScrubEnd();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [seekAt, onScrubStart, onScrubEnd]
  );

  const MIN_TRIM = 1;
  const trimAt = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el || !duration || !onTrimChange) return;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - r.left, 0), r.width);
      let secs = (x / r.width) * duration;

      if (snapping) {
        const snapSecs = (8 / r.width) * duration;
        let best = null,
          bestD = snapSecs;
        for (const c of clips) {
          const dEnd = Math.abs(c.start + c.duration - secs);
          if (dEnd < bestD) {
            bestD = dEnd;
            best = c.start + c.duration;
          }
        }
        if (best != null) secs = best;
      }

      secs = Math.min(Math.max(secs, MIN_TRIM), duration);
      onTrimChange(+secs.toFixed(3));
    },
    [duration, clips, onTrimChange, snapping]
  );

  const onTrimDown = useCallback(
    (e) => {
      e.stopPropagation();
      trimAt(e.clientX);
      const move = (ev) => trimAt(ev.clientX);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [trimAt]
  );

  const MIN_CLIP = 0.3;
  const [drag, setDrag] = useState(null);

  const boundaryAt = useCallback(
    (clientX, i) => {
      const el = trackRef.current;
      if (!el || !duration) return null;
      const a = clips[i],
        b = clips[i + 1];
      if (!a || !b) return null;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - r.left, 0), r.width);
      const secs = (x / r.width) * duration;
      const lo = a.start + MIN_CLIP;
      const hi = b.start + b.duration - MIN_CLIP;
      return Math.min(Math.max(secs, lo), Math.max(lo, hi));
    },
    [duration, clips]
  );

  const onResizeDown = useCallback(
    (e, i) => {
      e.stopPropagation();
      setDrag({ index: i, sec: clips[i + 1].start });
      const move = (ev) => {
        const s = boundaryAt(ev.clientX, i);
        if (s != null) setDrag({ index: i, sec: s });
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const s = boundaryAt(ev.clientX, i);
        setDrag(null);
        if (s != null && onResizeBoundary && Math.abs(s - clips[i + 1].start) > 0.001) {
          onResizeBoundary(clips[i + 1].name, s);
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [boundaryAt, clips, onResizeBoundary]
  );

  const sfxTimeAt = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el || !duration) return 0;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - r.left, 0), r.width);
      return (x / r.width) * duration;
    },
    [duration]
  );

  const onSfxLaneDown = useCallback(
    (e) => {
      if (e.target !== e.currentTarget) return;
      if (onSfxAdd) onSfxAdd(+sfxTimeAt(e.clientX).toFixed(3));
    },
    [onSfxAdd, sfxTimeAt]
  );

  const onSfxDown = useCallback(
    (e, id) => {
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) moved = true;
        if (moved && onSfxMove) onSfxMove(id, +sfxTimeAt(ev.clientX).toFixed(3));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (!moved && onSfxOpen) onSfxOpen(id);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [sfxTimeAt, onSfxMove, onSfxOpen]
  );

  const onOverlayDown = useCallback(
    (e, id) => {
      e.stopPropagation();
      const el = trackRef.current;
      if (!el || !duration) return;
      const ov = (captionEffects || []).find((x) => x.id === id);
      if (!ov) return;
      const ovDur = Math.max(0.4, (ov.end || ov.start + 1.2) - ov.start);
      const startX = e.clientX;
      const origStart = ov.start;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) > 4) moved = true;
        if (moved && onOverlayMove) {
          const r = el.getBoundingClientRect();
          const deltaSec = (dx / r.width) * duration;
          const newStart = Math.max(0, Math.min(duration - ovDur, origStart + deltaSec));
          onOverlayMove(id, newStart);
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (!moved) {
          if (onSeek) onSeek(ov.start);
          if (onOverlaySelect) onOverlaySelect(id);
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [captionEffects, duration, onOverlayMove, onOverlaySelect, onSeek]
  );

  const onClipClick = useCallback(
    (name, e) => {
      const d = downRef.current;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) {
        if (activeTool === "razor" && onSplitClip) {
          const targetSec = seekAt(e.clientX);
          onSplitClip(targetSec);
        } else {
          seekAt(e.clientX);
          if (onSelect) onSelect(name);
        }
      }
    },
    [activeTool, onSplitClip, onSelect, seekAt]
  );

  const onClipContextMenu = useCallback(
    (name, e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetSec = seekAt(e.clientX);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        clipName: name,
        sec: targetSec,
      });
      if (onSelect) onSelect(name);
    },
    [seekAt, onSelect]
  );

  // Ruler tick interval calculation
  const tickStep = useMemo(() => {
    const scaledDuration = duration / zoomScale;
    if (scaledDuration > 120) return 30;
    if (scaledDuration > 60) return 15;
    if (scaledDuration > 30) return 10;
    if (scaledDuration > 10) return 5;
    if (scaledDuration > 5) return 2;
    return 1;
  }, [duration, zoomScale]);

  const ticks = useMemo(() => {
    const arr = [];
    if (!duration || duration <= 0) return arr;
    for (let t = 0; t <= duration; t += tickStep) {
      arr.push(t);
    }
    return arr;
  }, [duration, tickStep]);

  const pct = (v) => `${Math.min(100, Math.max(0, (v / duration) * 100))}%`;
  const stop = (e) => e.stopPropagation();

  const trimPos = trimEnd > 0 && trimEnd < duration ? trimEnd : duration;
  const trimmed = trimPos < duration;

  // Selected clip details
  const selectedClipObj = useMemo(() => {
    return clips.find((c) => c.name === selectedName);
  }, [clips, selectedName]);

  return (
    <div className="nle-timeline-root flex flex-col w-full bg-[#0a0d14] border border-[#1e2638] rounded-xl overflow-hidden shadow-2xl select-none text-[12px] text-[#94a3b8]">
      {/* 1. Premiere Pro / DaVinci Resolve Master Control Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e131d] border-b border-[#1e2638] gap-3">
        {/* Left: Professional Tool Palette & Actions */}
        <div className="flex items-center gap-2">
          {/* NLE Mode Toggle (Select vs Razor) */}
          <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-[#1f283d]">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                activeTool === "select"
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "text-[#8da0bd] hover:text-white"
              }`}
              onClick={() => setActiveTool("select")}
              title="Selection Tool (V) — Select & drag clips"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Select (V)</span>
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                activeTool === "razor"
                  ? "bg-[#ef4444] text-white shadow-sm"
                  : "text-[#8da0bd] hover:text-white"
              }`}
              onClick={() => setActiveTool("razor")}
              title="Razor Cut Tool (C) — Click anywhere on clip to cut"
            >
              <Slice className="w-3.5 h-3.5" />
              <span>Razor (C)</span>
            </button>
          </div>

          {/* Quick Split at Playhead */}
          {onSplitClip && (
            <button
              type="button"
              onClick={() => onSplitClip(time)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141b29] hover:bg-[#1d273b] active:bg-[#2563eb] text-[#f1f5f9] border border-[#232e44] font-semibold text-xs transition shadow-sm"
              title="Split Clip at Current Playhead (S)"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Split (S)</span>
            </button>
          )}

          {/* Ripple Delete selected clip */}
          {onDeleteClip && selectedName && (
            <button
              type="button"
              onClick={() => onDeleteClip(selectedName)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2d1217] hover:bg-[#ef4444] text-[#fca5a5] hover:text-white border border-[#4c1d24] font-semibold text-xs transition shadow-sm animate-in fade-in"
              title="Ripple Delete Selected Clip (Delete/Backspace) — Removes clip with no gap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Ripple Delete</span>
            </button>
          )}

          {/* Timeline Undo / Redo */}
          {(undo || redo) && (
            <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-[#1f283d] ml-1">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold text-[#8da0bd] hover:text-white disabled:opacity-30 disabled:hover:text-[#8da0bd] disabled:cursor-not-allowed transition"
                title="تراجع عن آخر عملية (Ctrl+Z) / Undo"
                aria-label="Undo"
              >
                <Undo2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold text-[#8da0bd] hover:text-white disabled:opacity-30 disabled:hover:text-[#8da0bd] disabled:cursor-not-allowed transition"
                title="إعادة العملية (Ctrl+Y) / Redo"
                aria-label="Redo"
              >
                <Redo2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Redo</span>
              </button>
            </div>
          )}

          {/* Snapping Magnet Switch */}
          <button
            type="button"
            onClick={() => setSnapping((s) => !s)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
              snapping
                ? "bg-[#1e3a8a]/40 border-[#3b82f6] text-[#93c5fd]"
                : "bg-[#0b0e14] border-[#1f283d] text-[#64748b] hover:text-white"
            }`}
            title="Toggle Magnetic Snap to Edges (N)"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Snap</span>
            {snapping && <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />}
          </button>
        </div>

        {/* Center: High-Precision SMPTE Timecode Readout */}
        <div className="flex items-center gap-2 bg-[#07090f] px-3 py-1 rounded-lg border border-[#1f283d] font-mono text-xs">
          <span className="text-[#64748b] font-bold text-[10px] tracking-wider">TIME</span>
          <span className="text-[#f59e0b] font-bold text-sm tracking-widest">{formatTC(time)}</span>
          <span className="text-[#334155]">/</span>
          <span className="text-[#94a3b8] font-semibold">{formatTC(duration)}</span>
          {selectedClipObj && (
            <>
              <span className="text-[#334155]">|</span>
              <span className="text-[10px] text-amber-300 font-bold">
                SEL: {selectedClipObj.duration.toFixed(1)}s
              </span>
            </>
          )}
        </div>

        {/* Right: Timeline Zoom Controls & Fit */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#07090f] px-2.5 py-1 rounded-lg border border-[#1f283d]">
            <button
              type="button"
              disabled={zoomScale <= 1}
              onClick={() => setZoomScale((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
              className="p-0.5 text-[#8da0bd] hover:text-white disabled:opacity-30 transition"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="1"
              max="5"
              step="0.25"
              value={zoomScale}
              onChange={(e) => setZoomScale(+e.target.value)}
              className="w-16 accent-[#3b82f6] h-1.5 cursor-pointer"
            />
            <span className="font-mono text-[11px] text-[#f1f5f9] font-bold w-7 text-center">
              {zoomScale}×
            </span>
            <button
              type="button"
              disabled={zoomScale >= 5}
              onClick={() => setZoomScale((z) => Math.min(5, +(z + 0.5).toFixed(1)))}
              className="p-0.5 text-[#8da0bd] hover:text-white disabled:opacity-30 transition"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setZoomScale(1)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141b29] hover:bg-[#1d273b] text-[#8da0bd] hover:text-white border border-[#1f283d] transition font-semibold text-xs"
            title="Fit Entire Timeline to Window (Shift+Z)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fit</span>
          </button>
        </div>
      </div>

      {/* 2. Timeline Multi-Track Area */}
      <div className="flex flex-row flex-1 min-h-[240px] overflow-hidden relative">
        {/* LEFT COLUMN: Broadcast Track Control Headers (DaVinci / Premiere Standard) */}
        <div className="w-[125px] shrink-0 bg-[#0c1018] border-r border-[#1e2638] flex flex-col z-20 select-none shadow-lg">
          {/* Ruler Header Spacer */}
          <div className="h-[28px] border-b border-[#1e2638] bg-[#080b12] flex items-center justify-between px-2.5 font-mono text-[10px] text-[#64748b] font-bold tracking-wider">
            <span>TRACKS</span>
            <span className="text-[#3b82f6]">V / A</span>
          </div>

          {/* Cuts / Transitions Lane Header */}
          <div className="h-[24px] border-b border-[#1e2638] bg-[#0a0e16] flex items-center justify-between px-2 text-[10px] text-[#64748b] font-bold">
            <span className="flex items-center gap-1 text-[#f59e0b]">
              <Layers className="w-3 h-3" />
              <span>TRANS</span>
            </span>
            <span className="text-[9px] text-[#475569] font-mono">{clips.length} cuts</span>
          </div>

          {/* V1 Video Track Header */}
          <div className="h-[74px] border-b border-[#1e2638] bg-[#0e1422] p-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#3b82f6] flex items-center gap-1">
                <VideoIcon className="w-3.5 h-3.5" />
                <span>V1</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setV1Visible((v) => !v)}
                  className={`p-1 rounded transition hover:bg-black/40 ${
                    v1Visible ? "text-[#3b82f6]" : "text-[#475569]"
                  }`}
                  title={v1Visible ? "Hide Video Track (Mute Video)" : "Show Video Track"}
                >
                  {v1Visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setV1Locked((l) => !l)}
                  className={`p-1 rounded transition hover:bg-black/40 ${
                    v1Locked ? "text-amber-500" : "text-[#475569]"
                  }`}
                  title={v1Locked ? "Unlock Video Track" : "Lock Video Track"}
                >
                  {v1Locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#8da0bd] truncate font-medium">Video / Media</span>
              <span className="text-[9px] font-mono text-[#475569]">{clips.length}</span>
            </div>
          </div>

          {/* A1 Voiceover Audio Track Header */}
          <div className="h-[46px] border-b border-[#1e2638] bg-[#0a1420] p-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#06b6d4] flex items-center gap-1">
                <Music className="w-3.5 h-3.5" />
                <span>A1</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setA1Muted((m) => !m)}
                  className={`px-1 py-0.5 rounded text-[9.5px] font-bold transition ${
                    a1Muted
                      ? "bg-[#ef4444] text-white"
                      : "bg-[#142333] text-[#06b6d4] hover:bg-[#1f374f]"
                  }`}
                  title="Mute Audio Track (M)"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => setA1Solo((s) => !s)}
                  className={`px-1 py-0.5 rounded text-[9.5px] font-bold transition ${
                    a1Solo
                      ? "bg-[#eab308] text-black"
                      : "bg-[#142333] text-[#94a3b8] hover:bg-[#1f374f]"
                  }`}
                  title="Solo Audio Track (S)"
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() => setA1Locked((l) => !l)}
                  className={`p-0.5 rounded transition ${
                    a1Locked ? "text-amber-500" : "text-[#475569]"
                  }`}
                  title="Lock Audio Track"
                >
                  {a1Locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#67e8f9] truncate">Voiceover Master</span>
              {/* Stereo Meter Indicator */}
              <div className="flex gap-0.5 items-end h-2">
                <div className="w-1 bg-[#10b981] h-2 rounded-xs" />
                <div className="w-1 bg-[#10b981] h-1.5 rounded-xs" />
              </div>
            </div>
          </div>

          {/* A2 SFX Sound Effects Track Header */}
          <div className="h-[34px] border-b border-[#1e2638] bg-[#120e22] px-2 flex items-center justify-between">
            <span className="font-bold text-xs text-[#a855f7] flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>A2</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setA2Muted((m) => !m)}
                className={`px-1 py-0.2 rounded text-[9px] font-bold transition ${
                  a2Muted ? "bg-[#ef4444] text-white" : "bg-[#21163b] text-[#c084fc]"
                }`}
                title="Mute SFX Track"
              >
                M
              </button>
              <span className="text-[9.5px] font-mono text-[#a855f7]">SFX ({sfx.length})</span>
            </div>
          </div>

          {/* T1 Subtitles & Text Overlays Track Header */}
          {captionEffects && captionEffects.length > 0 && (
            <div className="h-[34px] bg-[#0c1819] px-2 flex items-center justify-between">
              <span className="font-bold text-xs text-[#10b981] flex items-center gap-1">
                <TypeIcon className="w-3 h-3" />
                <span>T1</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setT1Visible((v) => !v)}
                  className={`p-0.5 rounded transition ${
                    t1Visible ? "text-[#10b981]" : "text-[#475569]"
                  }`}
                  title="Toggle Captions"
                >
                  {t1Visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <span className="text-[9.5px] text-[#34d399] font-mono">
                  {captionEffects.length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Interactive Scrollable Timeline Canvas */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#07090e]"
          style={{ cursor: activeTool === "razor" ? "crosshair" : "default" }}
        >
          <div
            ref={trackRef}
            className="relative h-full flex flex-col"
            style={{
              width: zoomScale > 1 ? `${zoomScale * 100}%` : "100%",
              minWidth: "100%",
            }}
          >
            {/* 1. Precision Timecode Scale Ruler */}
            <div
              className="h-[28px] border-b border-[#1e2638] bg-[#090d16] relative select-none cursor-pointer"
              onPointerDown={onScrubDown}
              title="Click or drag to scrub playhead"
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 flex flex-col items-center justify-between pointer-events-none"
                  style={{ left: pct(t) }}
                >
                  <span className="font-mono text-[9.5px] text-[#64748b] font-semibold mt-1">
                    {label(t)}
                  </span>
                  <div className="w-[1px] h-2 bg-[#2d3b55]" />
                </div>
              ))}
            </div>

            {/* 2. Transitions / Cuts Lane */}
            <div className="h-[24px] border-b border-[#171f2e] bg-[#060910] relative">
              {clips.map((c, i) => {
                if (i === 0) return null;
                const tr = transitionOf(transitionsByName && transitionsByName[c.name]);
                const isSelected = selectedName === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    className={`absolute top-0.5 -translate-x-1/2 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border transition ${
                      isSelected
                        ? "bg-amber-500 text-black border-white shadow-md z-10"
                        : tr.xfade
                        ? "bg-[#2563eb] text-white border-[#3b82f6]"
                        : "bg-[#182030] text-[#94a3b8] border-[#222c40] hover:border-[#3b82f6] hover:text-white"
                    }`}
                    style={{ left: pct(c.start) }}
                    title={`Transition: ${tr.label} (Click to change)`}
                    onPointerDown={stop}
                    onClick={() => onSelect && onSelect(c.name)}
                  >
                    {tr.icon}
                  </button>
                );
              })}
            </div>

            {/* 3. V1 Video / Image Clips Track Lane */}
            <div
              className={`h-[74px] border-b border-[#1e2638] bg-[#080c14] relative flex items-center ${
                !v1Visible ? "opacity-20" : ""
              }`}
            >
              {clips.map((c, i) => {
                let cStart = c.start,
                  cDur = c.duration;
                if (drag) {
                  if (i === drag.index) cDur = drag.sec - c.start;
                  else if (i === drag.index + 1) {
                    cStart = drag.sec;
                    cDur = c.start + c.duration - drag.sec;
                  }
                }
                const style = { left: pct(cStart), width: pct(cDur) };

                if (c.gap) {
                  return (
                    <div
                      key={c.name}
                      className="absolute top-1 bottom-1 rounded-md border border-dashed border-[#334155] bg-[#0d131f]/50 flex items-center justify-center cursor-pointer hover:border-[#3b82f6] transition group"
                      style={style}
                      title={`Empty Scene Gap (${cDur.toFixed(1)}s) — Click to fill`}
                      onPointerDown={stop}
                      onClick={() => onAdd && onAdd(c.name)}
                    >
                      <Plus className="w-3.5 h-3.5 text-[#64748b] group-hover:text-[#3b82f6]" />
                    </div>
                  );
                }

                const el = imageEls[c.name];
                const isActive = c.name === activeName;
                const isSelected = c.name === selectedName;
                const fname = el && el.fileName ? stem(el.fileName) : `Scene ${i + 1}`;

                return (
                  <div
                    key={c.name}
                    className={`absolute top-1 bottom-1 rounded-lg overflow-hidden border cursor-pointer group transition-all flex items-center shadow-md select-none ${
                      isSelected
                        ? "border-[#f59e0b] shadow-[0_0_14px_rgba(245,158,11,0.45)] ring-1 ring-[#f59e0b] z-10"
                        : isActive
                        ? "border-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.3)] z-10"
                        : "border-[#1e293b] hover:border-[#475569] bg-[#111827]"
                    }`}
                    style={{
                      ...style,
                      backgroundImage: el && el.url ? `url(${el.url})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                    onPointerDown={(e) => {
                      downRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onClick={(e) => onClipClick(c.name, e)}
                    onDoubleClick={() => onOpen && onOpen(c.name)}
                    onContextMenu={(e) => onClipContextMenu(c.name, e)}
                  >
                    {/* Dark gradient filmstrip vignette for text contrast */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/60 pointer-events-none" />

                    {/* Clip Info Metadata Header & Footer */}
                    <div className="relative z-10 flex flex-col justify-between h-full p-1.5 w-full pointer-events-none">
                      {/* Top Bar of Clip Card */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[9px] font-bold text-white bg-black/75 px-1 py-0.2 rounded border border-white/10 shadow-xs">
                            {cDur.toFixed(1)}s
                          </span>
                          {el && el.isVideo && (
                            <span className="font-bold text-[8.5px] text-[#60a5fa] bg-black/75 px-1 py-0.2 rounded flex items-center gap-0.5 border border-[#3b82f6]/30">
                              <VideoIcon className="w-2.5 h-2.5" />
                              <span>VID</span>
                            </span>
                          )}
                          {motionByName &&
                            motionByName[c.name] &&
                            motionByName[c.name] !== "none" && (
                              <span
                                className="text-[9px] font-bold text-[#fbbf24] bg-black/75 px-1 rounded border border-[#f59e0b]/30"
                                title={`Motion: ${motionByName[c.name]}`}
                              >
                                {motionByName[c.name] === "zoomout" ? "⤡ Out" : "⤢ In"}
                              </span>
                            )}
                        </div>

                        {/* Hover Quick Action Buttons */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition pointer-events-auto">
                          {onOpen && (
                            <button
                              type="button"
                              onClick={(e) => {
                                stop(e);
                                onOpen(c.name);
                              }}
                              className="p-1 rounded bg-black/70 hover:bg-[#2563eb] text-white transition shadow-sm"
                              title="Clip Properties / Settings"
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                          )}
                          {onSplitClip && (
                            <button
                              type="button"
                              onClick={(e) => {
                                stop(e);
                                const targetSec = seekAt(e.clientX);
                                onSplitClip(targetSec);
                              }}
                              className="p-1 rounded bg-black/70 hover:bg-[#ef4444] text-white transition shadow-sm"
                              title="Split Clip Here (Razor)"
                            >
                              <Scissors className="w-3 h-3" />
                            </button>
                          )}
                          {onDeleteClip && (
                            <button
                              type="button"
                              onClick={(e) => {
                                stop(e);
                                onDeleteClip(c.name);
                              }}
                              className="p-1 rounded bg-black/70 hover:bg-[#dc2626] text-[#fca5a5] hover:text-white transition shadow-sm"
                              title="Ripple Delete Clip"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Bottom Title of Clip Card */}
                      <span className="text-[10.5px] font-bold text-white truncate max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {fname}
                      </span>
                    </div>

                    {/* Razor Split Tool Hover Overlay */}
                    {onSplitClip && activeTool === "razor" && (
                      <div className="absolute inset-0 bg-red-500/15 border-2 border-red-500 pointer-events-none flex items-center justify-center">
                        <Scissors className="w-4 h-4 text-red-500 animate-pulse" />
                      </div>
                    )}

                    {/* Left Trim Handle (In-Point) */}
                    {i > 0 && !v1Locked && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-[#3b82f6] opacity-0 group-hover:opacity-100 transition z-20 flex items-center justify-center"
                        title="Drag to trim boundary"
                        onPointerDown={(e) => onResizeDown(e, i - 1)}
                      >
                        <div className="w-[1.5px] h-4 bg-white/70" />
                      </div>
                    )}

                    {/* Right Trim Handle (Out-Point) */}
                    {i < clips.length - 1 && !v1Locked && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-[#3b82f6] opacity-0 group-hover:opacity-100 transition z-20 flex items-center justify-center"
                        title="Drag to trim boundary"
                        onPointerDown={(e) => onResizeDown(e, i)}
                      >
                        <div className="w-[1.5px] h-4 bg-white/70" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 4. A1 Audio Track Lane */}
            <div
              className={`h-[46px] border-b border-[#1e2638] bg-[#07111a] relative flex items-center cursor-pointer transition ${
                a1Muted ? "opacity-30" : ""
              }`}
              onPointerDown={onScrubDown}
              title="Click or drag to scrub voiceover / audio"
            >
              <Waveform peaks={peaks} color="#06b6d4" />
              {a1Muted && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-red-400 bg-black/40 tracking-widest pointer-events-none">
                  MUTED
                </div>
              )}
            </div>

            {/* 5. A2 Sound Effects (SFX) Track Lane */}
            <div
              className={`h-[34px] border-b border-[#1e2638] bg-[#0d091a] relative cursor-pointer ${
                a2Muted ? "opacity-30" : ""
              }`}
              onPointerDown={onSfxLaneDown}
              title="Click anywhere to place sound effect"
            >
              {sfx.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="absolute top-1 bottom-1 -translate-x-1/2 px-2.5 rounded-full bg-[#9333ea] hover:bg-[#a855f7] active:bg-[#c084fc] text-white text-[9.5px] font-bold flex items-center gap-1.5 shadow-md z-10 transition border border-[#c084fc]/30"
                  style={{ left: pct(s.at) }}
                  title={`${s.name} (${label(s.at)}) — Drag to retime`}
                  onPointerDown={(e) => onSfxDown(e, s.id)}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[85px]">{s.name}</span>
                </button>
              ))}
            </div>

            {/* 6. T1 Subtitles / Captions Track Lane */}
            {captionEffects && captionEffects.length > 0 && (
              <div
                className={`h-[34px] bg-[#071415] relative overflow-hidden ${
                  !t1Visible ? "opacity-20" : ""
                }`}
              >
                {captionEffects.map((ov) => {
                  const ovStart = ov.start;
                  const ovDur = Math.max(0.4, (ov.end || ov.start + 1.2) - ovStart);
                  const isSelected = selectedOverlayId === ov.id;
                  return (
                    <div
                      key={ov.id}
                      className={`absolute top-1 bottom-1 rounded-md px-2 flex items-center text-[10px] font-bold truncate cursor-grab border transition ${
                        isSelected
                          ? "bg-[#10b981] text-black border-white shadow-md z-10"
                          : "bg-[#064e3b] text-[#a7f3d0] border-[#059669]"
                      }`}
                      style={{
                        left: pct(ovStart),
                        width: pct(ovDur),
                      }}
                      onPointerDown={(e) => onOverlayDown(e, ov.id)}
                      title={`Caption: "${ov.text}" — Drag to retime`}
                    >
                      <span className="truncate">{ov.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 7. Master Scrub Playhead Indicator (DaVinci / Premiere Needle) */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#f59e0b] pointer-events-none z-30 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
              style={{ left: pct(time) }}
            >
              {/* Playhead Top Needle Head */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#f59e0b] rounded-t-xs rotate-45 shadow-md flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-black rounded-full" />
              </div>
            </div>

            {/* 8. Export Trim Limit Overlay & OUT Point Handle */}
            {trimmed && (
              <div
                className="absolute top-0 bottom-0 bg-black/70 pointer-events-none z-20"
                style={{ left: pct(trimPos), width: pct(duration - trimPos) }}
              />
            )}
            <div
              className="absolute top-0 bottom-0 w-[3px] bg-[#ef4444] cursor-ew-resize z-25 hover:w-1.5 transition-all"
              style={{ left: pct(trimPos) }}
              onPointerDown={onTrimDown}
              title="Export Out Point (Drag to trim video output duration)"
            >
              <div className="absolute top-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded bg-[#ef4444] text-white font-mono text-[8px] font-bold uppercase shadow-sm">
                OUT
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Premiere Pro / DaVinci Resolve Clip Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#141b29] border border-[#26354f] rounded-lg shadow-2xl p-1 min-w-[200px] text-xs font-semibold text-[#f1f5f9] animate-in fade-in zoom-in-95 duration-100 select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {onSplitClip && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2563eb] hover:text-white flex items-center gap-2 transition"
              onClick={() => {
                onSplitClip(contextMenu.sec);
                setContextMenu(null);
              }}
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Split at Cursor (S)</span>
            </button>
          )}

          {onOpen && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2563eb] hover:text-white flex items-center gap-2 transition"
              onClick={() => {
                onOpen(contextMenu.clipName);
                setContextMenu(null);
              }}
            >
              <Settings className="w-3.5 h-3.5 text-[#3b82f6]" />
              <span>Clip Properties / Inspector</span>
            </button>
          )}

          {onReplaceClip && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2563eb] hover:text-white flex items-center gap-2 transition"
              onClick={() => {
                onReplaceClip(contextMenu.clipName);
                setContextMenu(null);
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Replace Media...</span>
            </button>
          )}

          <div className="my-1 border-t border-[#232e44]" />

          {onDeleteClip && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#ef4444] text-[#fca5a5] hover:text-white flex items-center gap-2 transition"
              onClick={() => {
                onDeleteClip(contextMenu.clipName);
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Ripple Delete (Delete)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
