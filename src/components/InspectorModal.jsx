import { useCallback, useEffect, useRef, useState } from "react";
import { tc } from "../lib/format";
import EffectsPanel from "./panels/EffectsPanel";

export default function InspectorModal({
  inspect, onClose,
  clips, imageEls, imageClips, imageCount,
  videoInfoByName, volumeByName, setVolume,
  trimByName, setTrim, fitByName, setFit,
  speedByName = {}, setClipSpeed, onSplitClip,
  motionByName, setMotion,
  effectByName = {}, setClipEffect, removeClipEffect,
  replaceImage, removeImage,
  coarse,
}) {
  const replaceImgInputRef = useRef(null);
  const replaceVidInputRef = useRef(null);
  const modalVideoRef = useRef(null);
  const [pendFile, setPendFile] = useState(null);
  const [pendUrl, setPendUrl] = useState(null);

  const clearPend = useCallback(() => {
    setPendUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setPendFile(null);
  }, []);
  const close = useCallback(() => { clearPend(); onClose(); }, [clearPend, onClose]);

  const onPickReplacement = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !(file.type.startsWith("image/") || file.type.startsWith("video/"))) return;
    setPendFile(file);
    setPendUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(file); });
  }, []);
  const applyReplacement = useCallback(() => {
    if (inspect && pendFile && replaceImage) replaceImage(inspect, pendFile);
    close();
  }, [inspect, pendFile, replaceImage, close]);
  const removeInspected = useCallback(() => {
    if (inspect && removeImage) removeImage(inspect);
    close();
  }, [inspect, removeImage, close]);

  useEffect(() => {
    if (!inspect) return;
    const onEsc = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [inspect, close]);

  if (!inspect) return null;

  const insClip = clips.find((c) => c.name === inspect);
  const el = imageEls[inspect];
  const num = insClip ? imageClips.indexOf(insClip) + 1 : 0;
  const curUrl = pendUrl || (el && el.url);
  const pendIsVid = !!(pendFile && pendFile.type && pendFile.type.startsWith("video/"));
  const isVid = !!(el && el.isVideo) && !pendUrl;
  const vinfo = videoInfoByName[inspect] || {};
  const vol = volumeByName[inspect] == null ? 0.5 : volumeByName[inspect];
  const inPt = trimByName[inspect] || 0;
  const kind = isVid ? "Video / فيديو" : "Image / صورة";
  const slotDur = (insClip && insClip.duration) || 0;
  const vdur = vinfo.duration || 0;
  const longer = !!(vdur && insClip && vdur > slotDur + 0.05);
  const shorter = !!(vdur && insClip && vdur < slotDur - 0.05);
  const diff = longer || shorter;
  const fitMode = fitByName[inspect] || (longer ? "trim" : "fit");
  const naturalSpeed = (diff && slotDur > 0) ? (vdur / slotDur) : 1;
  const customSpeed = (speedByName && speedByName[inspect]) || (fitMode === "fit" && diff ? naturalSpeed : 1);
  const clipFx = effectByName[inspect];
  const clipFxOn = !!clipFx;

  return (
    <>
      <input
        ref={replaceImgInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickReplacement}
      />
      <input
        ref={replaceVidInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={onPickReplacement}
      />

      <div className="modal" role="dialog" aria-modal="true" onClick={close}>
        <div className="modal__card" onClick={(e) => e.stopPropagation()}>
          <div className="modal__head">
            <span className="modal__title">
              {num ? `${kind} · المشهد ${num} من ${imageCount}` : kind}
              {insClip && <span className="modal__at"> · {tc(insClip.start)} ({slotDur.toFixed(1)}s)</span>}
            </span>
            <button className="modal__x" onClick={close} aria-label="Close">✕</button>
          </div>

          <div className="modal__stage">
            {pendUrl ? (
              pendIsVid
                ? <video src={pendUrl} className="modal__stagevid" controls muted playsInline preload="metadata" />
                : <img src={pendUrl} alt="" />
            ) : isVid && vinfo.url ? (
              <video
                ref={modalVideoRef} src={vinfo.url} className="modal__stagevid"
                controls muted playsInline preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  try { v.currentTime = inPt; } catch { /* ignore */ }
                  v.playbackRate = Math.min(16, Math.max(0.0625, customSpeed));
                }}
              />
            ) : (curUrl && <img src={curUrl} alt="" />)}
            {pendUrl && <span className="modal__flag">معاينة الملف المختار — اضغط "تأكيد الاستبدال" لتطبيقه</span>}
          </div>

          <div className="modal__file flex items-center justify-between">
            <span className="truncate">{pendFile ? pendFile.name : (el && el.fileName) || "Media Item"}</span>
            <span className="text-xs text-[var(--muted)] font-mono">{slotDur.toFixed(2)}s</span>
          </div>

          {/* Quick Media Replacement Bar: Explicit Image or Video Choice */}
          <div className="p-3 bg-[var(--surface-hover)] rounded-lg border border-[var(--line)] flex flex-col gap-2">
            <span className="text-xs font-semibold text-[var(--text-pure)] flex items-center gap-1.5">
              <span>🔄</span>
              <span>تغيير المحتوى واستبداله (Replace Media):</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="mbtn mbtn--primary flex items-center justify-center gap-2 py-2"
                onClick={() => replaceImgInputRef.current && replaceImgInputRef.current.click()}
              >
                <span>🖼</span>
                <span className="text-xs font-bold">استبدال بصورة (Image)</span>
              </button>
              <button
                type="button"
                className="mbtn mbtn--primary flex items-center justify-center gap-2 py-2"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
                onClick={() => replaceVidInputRef.current && replaceVidInputRef.current.click()}
              >
                <span>🎬</span>
                <span className="text-xs font-bold">استبدال بفيديو (Video)</span>
              </button>
            </div>
          </div>

          {/* Speed & Trimming Controls for Video / Motion */}
          {insClip && !insClip.gap && (
            <div className="modal__vid p-3 bg-[var(--surface)] rounded-lg border border-[var(--line)] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="modal__motion-label mb-0 flex items-center gap-1">
                  <span>⚡</span>
                  <span>سرعة التشغيل (Playback Speed):</span>
                </span>
                <span className="font-mono text-xs font-bold text-[var(--accent)]">{customSpeed.toFixed(2)}×</span>
              </div>

              {/* Speed Preset Buttons */}
              <div className="seg">
                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={Math.abs(customSpeed - s) < 0.05 ? "is-on" : ""}
                    onClick={() => {
                      if (setClipSpeed) setClipSpeed(inspect, s);
                      if (modalVideoRef.current) {
                        try { modalVideoRef.current.playbackRate = s; } catch { /* ignore */ }
                      }
                    }}
                  >
                    {s}×
                  </button>
                ))}
              </div>

              {/* Manual Speed Slider */}
              <div className="modal__slider flex items-center gap-3">
                <input
                  type="range"
                  min={0.25}
                  max={3.0}
                  step={0.05}
                  value={customSpeed}
                  onChange={(e) => {
                    const s = +e.target.value;
                    if (setClipSpeed) setClipSpeed(inspect, s);
                    if (modalVideoRef.current) {
                      try { modalVideoRef.current.playbackRate = s; } catch { /* ignore */ }
                    }
                  }}
                  className="flex-1"
                />
                <button
                  type="button"
                  className="px-2 py-0.5 text-[11px] rounded bg-[var(--surface-hover)] border border-[var(--line)] text-[var(--muted)] hover:text-white"
                  onClick={() => {
                    if (setClipSpeed) setClipSpeed(inspect, 1.0);
                    if (modalVideoRef.current) {
                      try { modalVideoRef.current.playbackRate = 1.0; } catch { /* ignore */ }
                    }
                  }}
                >
                  إعادة ضبط 1×
                </button>
              </div>

              {/* Split Clip Action directly from Inspector */}
              <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[var(--text-pure)]">تقطيع المشهد (Split Clip):</span>
                  <span className="text-[11px] text-[var(--muted)]">تقسيم هذا المشهد إلى جزأين مستقلين للتعديل</span>
                </div>
                {onSplitClip && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white text-xs font-bold transition flex items-center gap-1.5"
                    onClick={() => {
                      const mid = insClip.start + insClip.duration / 2;
                      onSplitClip(mid);
                      close();
                    }}
                  >
                    <span>✂</span>
                    <span>تقطيع في المنتصف</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Ken Burns Motion */}
          {insClip && !insClip.gap && (
            <div className="modal__motion">
              <span className="modal__motion-label">حركة المشهد (Ken Burns zoom)</span>
              <div className="seg">
                {[["none", "بدون"], ["zoomin", "تقريب (Zoom in)"], ["zoomout", "تبعيد (Zoom out)"]].map(([id, lbl]) => (
                  <button
                    key={id}
                    type="button"
                    className={((motionByName && motionByName[inspect]) || "none") === id ? "is-on" : ""}
                    onClick={() => setMotion && setMotion(inspect, id)}
                  >{lbl}</button>
                ))}
              </div>
            </div>
          )}

          {insClip && !insClip.gap && (
            <div className="modal__motion">
              <div className="cap-bar" style={{ justifyContent: "space-between", ...(clipFxOn ? {} : { borderBottom: "none", paddingBottom: 0, marginBottom: 0 }) }}>
                <span className="modal__motion-label" style={{ marginBottom: 0 }}>
                  تأثير بصري مخصص (Override Filter)
                </span>
                <button
                  type="button"
                  className={`cap-switch ${clipFxOn ? "is-on" : ""}`}
                  onClick={() => (clipFxOn ? removeClipEffect && removeClipEffect(inspect) : setClipEffect && setClipEffect(inspect, {}))}
                  aria-pressed={clipFxOn}
                >
                  <span className="cap-switch__box" />
                  {clipFxOn ? "مفعل" : "معطل"}
                </button>
              </div>
              {clipFxOn && (
                <EffectsPanel
                  bare
                  effectId={clipFx.id}
                  setEffectId={(id) => setClipEffect(inspect, { id })}
                  effectIntensity={clipFx.intensity}
                  setEffectIntensity={(v) => setClipEffect(inspect, { intensity: v })}
                />
              )}
            </div>
          )}

          {insClip && !insClip.gap && isVid && (
            <div className="modal__vid">
              {diff && (
                <div className="modal__fit">
                  <span className="modal__motion-label">
                    {longer ? "الفيديو أطول من المساحة الزمنية" : "الفيديو أقصر من المساحة الزمنية"} · {vinfo.duration.toFixed(1)}s مقطع, {insClip.duration.toFixed(1)}s مساحة
                  </span>
                  <div className="seg">
                    <button
                      type="button" className={fitMode === "fit" ? "is-on" : ""}
                      onClick={() => setFit && setFit(inspect, "fit")}
                    >ملاءمة المدة (Fit)</button>
                    <button
                      type="button" className={fitMode === "trim" ? "is-on" : ""}
                      onClick={() => setFit && setFit(inspect, "trim")}
                    >قص واقتطاع (Trim)</button>
                  </div>
                  {fitMode === "fit"
                    ? <span className="modal__hint">{longer
                      ? `تسريع الفيديو بمعدل ${naturalSpeed.toFixed(1)}× لملاءمة مدة المشهد بالكامل.`
                      : `إبطاء الفيديو بمعدل ${naturalSpeed.toFixed(2)}× لملء المشهد.`}</span>
                    : <span className="modal__hint">تشغيل بسرعة 1× — حدد نقطة البداية بالأسفل؛{longer ? " وسيتم اقتطاع الباقي." : " ويتم تثبيت آخر إطار لملء الفراغ."}</span>}
                </div>
              )}
              {(!diff || fitMode === "trim") && (() => {
                const dur = vinfo.duration || 0;
                const remain = Math.max(0, dur - inPt);
                const playLen = Math.min(insClip.duration, remain);
                const holdFor = Math.max(0, insClip.duration - remain);
                return (
                  <div className="modal__trim">
                    <span className="modal__motion-label">قص وتحديد نقطة بداية الفيديو (Trim Start)</span>
                    <div className="trimbar">
                      <div
                        className="trimbar__fill"
                        style={{ left: `${dur ? (inPt / dur) * 100 : 0}%`, width: `${dur ? (playLen / dur) * 100 : 0}%` }}
                      />
                      <input
                        className="trimbar__range"
                        type="range" min={0} max={Math.max(0.1, dur)} step={0.05}
                        value={Math.min(inPt, Math.max(0.1, dur))}
                        onChange={(e) => {
                          const val = +e.target.value;
                          if (setTrim) setTrim(inspect, val);
                          if (modalVideoRef.current) { try { modalVideoRef.current.currentTime = val; } catch { /* ignore */ } }
                        }}
                      />
                    </div>
                    <span className="modal__hint">
                      يبدأ من {inPt.toFixed(1)}s من أصل {dur.toFixed(1)}s · يعرض {playLen.toFixed(1)}s في مساحة {insClip.duration.toFixed(1)}s
                    </span>
                    {holdFor > 0.05 && (
                      <span className="modal__hint modal__hint--warn">
                        يتبقى فقط {remain.toFixed(1)}s من المقطع — سيثبت الإطار الأخير لمدة {holdFor.toFixed(1)}s.
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="modal__vol">
                <span className="modal__motion-label">مستوى صوت الفيديو الأصلي (Clip Audio Volume)</span>
                <div className="modal__slider">
                  <input
                    type="range" min={0} max={1} step={0.05} value={vol}
                    onChange={(e) => setVolume && setVolume(inspect, +e.target.value)}
                  />
                  <span className="trdur__val">{Math.round(vol * 100)}%</span>
                </div>
                <span className="modal__hint">يشتغل تحت التعليق الصوتي. 0% = صامت تماماً.</span>
              </div>
            </div>
          )}

          {!pendUrl ? (
            <div className="modal__actions">
              <button className="mbtn mbtn--danger" onClick={removeInspected}>حذف من التايم لاين (Remove)</button>
              <button className="mbtn" onClick={close}>إغلاق (Done)</button>
            </div>
          ) : (
            <div className="modal__actions">
              <button className="mbtn mbtn--primary" onClick={applyReplacement}>✓ تأكيد وتطبيق الاستبدال</button>
              <button className="mbtn" onClick={() => replaceImgInputRef.current && replaceImgInputRef.current.click()}>اختيار صورة أخرى</button>
              <button className="mbtn mbtn--ghost" onClick={clearPend}>إلغاء</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
