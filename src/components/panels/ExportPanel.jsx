import { tc, clock } from "../../lib/format";

export default function ExportPanel({
  aspect, setAspect, fps, setFps,
  renderQuality, setRenderQuality, renderDims, dims,
  imageCount, gapCount, exportDuration, duration, elapsed,
  wcAvailable, serverAvailable, busy, wcBusy, wcPhase, wcProgress, progress,
  wcEnabled, setWcEnabled,
  onWebCodecsTest, onRender, onWebCodecsCancel, onCancel,
  outUrl, error,
}) {
  return (
    <div className="panel export">
      <h2 className="panel__h">Export</h2>

      <div className="ctrl-row">
        <label className="ctrl">
          <span className="ctrl__label">Aspect</span>
          <span className="selectwrap">
            <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
              <option value="16:9">16:9 — 1920×1080</option>
              <option value="9:16">9:16 — 1080×1920</option>
              <option value="auto">Auto — match</option>
            </select>
          </span>
        </label>
        <label className="ctrl">
          <span className="ctrl__label">FPS</span>
          <span className="selectwrap">
            <select value={fps} onChange={(e) => setFps(+e.target.value)}>
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
            </select>
          </span>
        </label>
        <label className="ctrl">
          <span className="ctrl__label">Quality</span>
          <span className="selectwrap">
            <select value={renderQuality} onChange={(e) => setRenderQuality && setRenderQuality(e.target.value)}>
              <option value="full">Full — {dims.width}×{dims.height}</option>
              <option value="720p">720p — faster</option>
            </select>
          </span>
        </label>
      </div>

      <dl className="specs">
        <div className="spec"><dt>Resolution</dt><dd>{(renderDims || dims).width}×{(renderDims || dims).height}{renderQuality === "720p" ? " · faster" : ""}</dd></div>
        <div className="spec"><dt>Images</dt><dd>{imageCount}</dd></div>
        <div className="spec spec--length">
          <dt>Length</dt>
          <dd>
            {tc(exportDuration)}
            {exportDuration < duration && (
              <span className="spec__trim">trimmed from {tc(duration)}</span>
            )}
          </dd>
        </div>
      </dl>

      {gapCount > 0 && (
        <div className="note note--gap">
          {gapCount} empty {gapCount === 1 ? "gap" : "gaps"} render black — fill with the <b>+</b>.
        </div>
      )}

      {/* Fast-render-only for now: the Fast/ffmpeg toggle is hidden and WebCodecs is
          always used when available. The ffmpeg backend code is kept (just not exposed);
          flip this back on to re-enable the toggle. */}
      {false && wcAvailable && serverAvailable && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, opacity: (busy || wcBusy) ? 0.5 : 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.85 }}>⚡ Fast render</span>
          <button
            type="button"
            className={`cap-switch ${wcEnabled ? "is-on" : ""}`}
            onClick={() => setWcEnabled && setWcEnabled((v) => !v)}
            disabled={busy || wcBusy}
            aria-pressed={!!wcEnabled}
            aria-label="Fast GPU render (WebCodecs)"
            title="Render on the GPU via WebCodecs — faster for image-only projects (beta)"
          >
            <span className="cap-switch__box" />
          </button>
        </div>
      )}
      {!(busy || wcBusy) ? (
        <button
          className="render"
          onClick={onWebCodecsTest || onRender}
          title="تصدير الفيديو بصيغة MP4"
        >
          🚀 Render MP4 / تصدير الفيديو
        </button>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#090e1a] border border-[#1e2a44] mt-2">
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="text-blue-400 animate-pulse">
              {wcPhase || "Rendering frames..."}
            </span>
            <span className="font-mono text-sm text-cyan-300 font-black tabular-nums">
              {Math.round((wcBusy ? wcProgress : progress) * 100)}%
            </span>
          </div>
          <div className="progress">
            <i style={{ width: `${Math.max(4, Math.round((wcBusy ? wcProgress : progress) * 100))}%` }} />
          </div>
          <div className="render-meta">
            <span>{clock(elapsed)} elapsed</span>
            {(wcBusy ? wcProgress : progress) > 0.03 && (
              <span>
                ~{clock((elapsed * (1 - (wcBusy ? wcProgress : progress))) / (wcBusy ? wcProgress : progress))} left
              </span>
            )}
          </div>
          <button className="cancel mt-1" onClick={wcBusy ? onWebCodecsCancel : onCancel}>
            Cancel Export / إلغاء التصدير
          </button>
        </div>
      )}
      {outUrl && <a className="download" href={outUrl} download="story.mp4">↓ Download MP4</a>}
      {error && <div className="note note--bad">{error}</div>}
    </div>
  );
}
