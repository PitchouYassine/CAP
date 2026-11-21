import { useState, useEffect, useRef } from "react";
import {
  Film,
  Download,
  X,
  Play,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Zap,
  Sliders,
  Maximize2,
} from "lucide-react";
import { tc, clock } from "../lib/format";

export default function ExportModal({
  isOpen,
  onClose,
  isExporting,
  exportProgress,
  exportPhase,
  elapsedTime,
  onStartExport,
  onCancelExport,
  outUrl,
  outFileName,
  outFileSize,
  error,
  aspect,
  fps,
  renderQuality,
  exportDuration,
  clipCount,
  isAr = true,
  wcAvailable = true,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const pct = Math.min(100, Math.max(0, Math.round((exportProgress || 0) * 100)));
  const remainingTime =
    exportProgress > 0.05 && elapsedTime > 0
      ? Math.max(0, Math.round((elapsedTime * (1 - exportProgress)) / exportProgress))
      : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#0e1320] border border-[#1e2a44] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden text-[#f1f5f9] flex flex-col"
        role="dialog"
        aria-modal="true"
        dir={isAr ? "rtl" : "ltr"}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b263e] bg-[#090d16]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white">
                {isAr ? "تصدير الفيديو MP4" : "Export Video MP4"}
              </h2>
              <p className="text-[11px] text-[#8da0bd]">
                {isExporting
                  ? isAr
                    ? "جاري معالجة الفيديو بجودة عالية..."
                    : "Rendering video with high fidelity..."
                  : outUrl
                  ? isAr
                    ? "اكتمل التصدير بنجاح"
                    : "Export completed successfully"
                  : isAr
                  ? "معاينة إعدادات التصدير وبدء المعالجة"
                  : "Review settings and initiate render"}
              </p>
            </div>
          </div>

          {!isExporting && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8da0bd] hover:text-white hover:bg-[#1a2337] transition"
              title={isAr ? "إغلاق" : "Close"}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* STATE 1: ACTIVE EXPORTING */}
          {isExporting ? (
            <div className="flex flex-col items-center justify-center text-center py-4 gap-5">
              {/* Giant Circular / Radial Progress or Big Percentage */}
              <div className="relative flex flex-col items-center justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-[#1e293b] flex flex-col items-center justify-center bg-[#070a12] shadow-inner relative overflow-hidden">
                  {/* Subtle spinning glow */}
                  <div
                    className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-cyan-400 animate-spin"
                    style={{ animationDuration: "1.8s" }}
                  />
                  <span className="text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                    {pct}%
                  </span>
                  <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest mt-0.5">
                    {isAr ? "جاري المعالجة" : "RENDERING"}
                  </span>
                </div>
              </div>

              {/* Progress Bar with glowing shimmer */}
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8da0bd]">
                  <span className="text-blue-300 flex items-center gap-1.5">
                    <RotateCw className="w-3 h-3 animate-spin text-blue-400" />
                    {exportPhase || (isAr ? "معالجة الإطارات..." : "Rendering frames...")}
                  </span>
                  <span className="font-mono text-white font-bold tabular-nums">
                    {pct} / 100%
                  </span>
                </div>

                <div className="w-full h-3 bg-[#080c14] border border-[#1e273c] rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-200 shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-3 w-full mt-1">
                <div className="flex flex-col p-3 rounded-xl bg-[#090e1a] border border-[#182338]">
                  <span className="text-[11px] text-[#64748b] font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {isAr ? "الوقت المنقضي" : "Elapsed Time"}
                  </span>
                  <span className="text-sm font-mono font-bold text-white mt-1 tabular-nums">
                    {clock(elapsedTime)}
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-[#090e1a] border border-[#182338]">
                  <span className="text-[11px] text-[#64748b] font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    {isAr ? "الوقت التقديري المتبقي" : "Estimated Left"}
                  </span>
                  <span className="text-sm font-mono font-bold text-white mt-1 tabular-nums">
                    {remainingTime != null ? `~${clock(remainingTime)}` : isAr ? "جاري الحساب..." : "Calculating..."}
                  </span>
                </div>
              </div>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={onCancelExport}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition"
              >
                {isAr ? "إلغاء عملية التصدير" : "Cancel Export"}
              </button>
            </div>
          ) : outUrl ? (
            /* STATE 2: EXPORT COMPLETE */
            <div className="flex flex-col items-center text-center py-2 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-white">
                  {isAr ? "تم تصدير الفيديو بنجاح!" : "Video Exported Successfully!"}
                </h3>
                <p className="text-xs text-[#8da0bd]">
                  {outFileName || "autoeditor.mp4"} • {tc(exportDuration)} • {fps} FPS
                  {outFileSize ? ` • ${outFileSize}` : ""}
                </p>
              </div>

              {/* Inline Mini Video Preview Player */}
              <div className="w-full rounded-xl overflow-hidden border border-[#1e2a44] bg-black shadow-lg">
                <video
                  ref={videoRef}
                  src={outUrl}
                  controls
                  playsInline
                  className="w-full max-h-56 object-contain"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-2">
                <a
                  href={outUrl}
                  download={outFileName || "story.mp4"}
                  className="flex-1 w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-[0_4px_16px_rgba(37,99,235,0.4)] transition"
                >
                  <Download className="w-4 h-4" />
                  <span>{isAr ? "تحميل ملف MP4 الآن" : "Download MP4 Video"}</span>
                </a>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto py-3 px-5 rounded-xl bg-[#141b2a] hover:bg-[#1f2a40] text-[#8da0bd] hover:text-white border border-[#232f48] text-sm font-semibold transition"
                >
                  {isAr ? "إغلاق" : "Close"}
                </button>
              </div>
            </div>
          ) : error ? (
            /* STATE 3: ERROR */
            <div className="flex flex-col items-center text-center py-4 gap-4">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <AlertCircle className="w-7 h-7" />
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-white">
                  {isAr ? "تعذر إكمال عملية التصدير" : "Export Encountered an Error"}
                </h3>
                <p className="text-xs text-red-300 font-mono bg-red-950/40 p-3 rounded-lg border border-red-900/50 max-h-32 overflow-auto text-left">
                  {error}
                </p>
              </div>

              <div className="flex items-center gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={onStartExport}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
                >
                  {isAr ? "إعادة المحاولة" : "Try Again"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl bg-[#141b2a] text-[#8da0bd] hover:text-white border border-[#232f48] text-xs font-semibold transition"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          ) : (
            /* STATE 4: READY TO EXPORT CONFIGURATION */
            <div className="flex flex-col gap-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col p-3 rounded-xl bg-[#090e1a] border border-[#182338]">
                  <span className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider">
                    {isAr ? "أبعاد الفيديو" : "Format & Aspect"}
                  </span>
                  <span className="text-xs font-bold text-white mt-1">
                    {aspect === "9:16" ? "9:16 (Shorts / Reels)" : "16:9 (YouTube Standard)"}
                  </span>
                  <span className="text-[11px] text-[#8da0bd]">
                    {renderQuality === "720p" ? "1280×720 • Fast" : "1920×1080 • Full HD"}
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-[#090e1a] border border-[#182338]">
                  <span className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider">
                    {isAr ? "المدة وعدد المقاطع" : "Duration & Clips"}
                  </span>
                  <span className="text-xs font-bold text-white mt-1 tabular-nums font-mono">
                    {tc(exportDuration)}
                  </span>
                  <span className="text-[11px] text-[#8da0bd]">
                    {clipCount} {isAr ? "مقاطع في التايملاين" : "Clips on timeline"}
                  </span>
                </div>
              </div>

              {/* Render Engine Badge */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b101c] border border-[#1c273e]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <div className="flex flex-col text-xs">
                    <span className="font-bold text-white">
                      {wcAvailable
                        ? isAr
                          ? "محرك تسريع العتاد (WebCodecs GPU)"
                          : "Hardware GPU Accelerator (WebCodecs)"
                        : isAr
                        ? "محرك المعالجة الشامل (Universal Canvas)"
                        : "Universal Canvas Engine (MediaRecorder)"}
                    </span>
                    <span className="text-[11px] text-[#64748b]">
                      {isAr
                        ? "تصدير فائق السرعة وبأعلى دقة نقاء داخل المتصفح"
                        : "Ultra-fast in-browser rendering with zero quality loss"}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {isAr ? "جاهز" : "READY"}
                </span>
              </div>

              {/* Start Export Button */}
              <button
                type="button"
                onClick={onStartExport}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition hover:scale-[1.01] active:scale-[0.99] mt-1"
              >
                <Film className="w-4 h-4" />
                <span>{isAr ? "بدء تصدير الفيديو (MP4)" : "Start Exporting Video (MP4)"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
