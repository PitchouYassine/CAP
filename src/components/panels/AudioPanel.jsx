import { useRef, useState, useEffect } from "react";
import { SFX_LIBRARY } from "../../lib/sfx";
import { previewSfx } from "../../lib/sfxScheduler";

// The Audio tab: voiceover audio speed and trimming controls, plus sound effects placement
export default function AudioPanel({
  selectedSound, setSelectedSound,
  sfxUploads = [], uploadSfx,
  audioDuration,
  audioSpeed = 1.0,
  onAudioSpeedChange,
  onAudioTrim,
  audioFile,
}) {
  const fileRef = useRef(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(() => (audioDuration ? +audioDuration.toFixed(1) : 30));
  const [busyAudio, setBusyAudio] = useState(false);

  useEffect(() => {
    if (audioDuration) {
      setTrimEnd(+audioDuration.toFixed(1));
    }
  }, [audioDuration]);

  const bundled = SFX_LIBRARY.map((s) => ({ name: s.label, url: s.file, src: { kind: "lib", file: s.file } }));
  const uploaded = sfxUploads.map((u) => ({ name: u.label, url: u.url, src: { kind: "upload", mediaId: u.mediaId } }));
  const isOn = (snd) => selectedSound && selectedSound.url === snd.url;

  const onPick = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f && uploadSfx) uploadSfx(f);
  };

  const applyTrim = async () => {
    if (!onAudioTrim) return;
    setBusyAudio(true);
    try {
      await onAudioTrim(trimStart, trimEnd);
    } finally {
      setBusyAudio(false);
    }
  };

  const applySpeed = async (sp) => {
    if (!onAudioSpeedChange) return;
    setBusyAudio(true);
    try {
      await onAudioSpeedChange(sp);
    } finally {
      setBusyAudio(false);
    }
  };

  const row = (snd) => (
    <div key={snd.url} className={`sfxrow ${isOn(snd) ? "is-on" : ""}`}>
      <button
        type="button" className="sfxrow__play"
        title="Preview"
        onClick={(e) => { e.stopPropagation(); previewSfx(snd.url, 0.9); }}
      >▶</button>
      <button
        type="button" className="sfxrow__name"
        onClick={() => setSelectedSound && setSelectedSound(snd)}
      >{snd.name}</button>
    </div>
  );

  return (
    <div className="panel flex flex-col gap-4">
      {/* Voiceover Master Track: Speed and Trimming */}
      <div className="p-3 bg-[var(--surface-hover)] rounded-xl border border-[var(--line)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--text-pure)] flex items-center gap-1.5">
            <span>🎙️</span>
            <span>التعليق الصوتي الرئيسي (A1 Voiceover):</span>
          </span>
          <span className="text-xs font-mono text-[var(--accent)] font-bold">
            {audioDuration ? `${audioDuration.toFixed(1)}s` : "0:00"}
          </span>
        </div>

        {/* Speed Multiplier Controls for Voiceover */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>سرعة الصوت (Audio Speed):</span>
            <span className="font-mono text-white font-bold">{audioSpeed.toFixed(2)}×</span>
          </div>
          <div className="seg">
            {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((s) => (
              <button
                key={s}
                type="button"
                disabled={busyAudio}
                className={Math.abs(audioSpeed - s) < 0.05 ? "is-on" : ""}
                onClick={() => applySpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Trimming / Cut Start & End */}
        {audioDuration > 0 && (
          <div className="pt-2 border-t border-[var(--line)] flex flex-col gap-2">
            <span className="text-xs font-bold text-[var(--muted)]">تقطيع وقص بداية ونهاية الصوت (Trim Range):</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[var(--muted)]">البداية (ثانية):</span>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, trimEnd - 0.5)}
                  step="0.5"
                  value={trimStart}
                  onChange={(e) => setTrimStart(+e.target.value)}
                  className="px-2 py-1 rounded bg-[var(--surface)] border border-[var(--line)] text-xs font-mono text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[var(--muted)]">النهاية (ثانية):</span>
                <input
                  type="number"
                  min={trimStart + 0.5}
                  max={Math.round(audioDuration * 2)}
                  step="0.5"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(+e.target.value)}
                  className="px-2 py-1 rounded bg-[var(--surface)] border border-[var(--line)] text-xs font-mono text-white"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={busyAudio}
              className="mbtn mbtn--primary py-1.5 text-xs font-bold flex items-center justify-center gap-1.5"
              onClick={applyTrim}
            >
              <span>✂</span>
              <span>{busyAudio ? "جاري المعالجة..." : "تطبيق تقطيع الصوت (Apply Audio Trim)"}</span>
            </button>
          </div>
        )}
      </div>

      <div>
        <h2 className="panel__h">مكتبة المؤثرات الصوتية (SFX Library)</h2>
        <div className="mini-h">اختر مؤثراً صوتياً ثم اضغط على مسار <b>A2 SFX</b> في التايم لاين لتحديده.</div>

        <div className="mini-h" style={{ marginTop: 12 }}>المكتبة الجاهزة</div>
        <div className="sfxlist">{bundled.map(row)}</div>

        {uploaded.length > 0 && (
          <>
            <div className="mini-h" style={{ marginTop: 12 }}>المؤثرات المرفوعة</div>
            <div className="sfxlist">{uploaded.map(row)}</div>
          </>
        )}

        <button type="button" className="trall" style={{ marginTop: 12 }} onClick={() => fileRef.current && fileRef.current.click()}>
          ⤒ رفع ملف صوتي جديد .mp3 / .wav
        </button>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav" hidden onChange={onPick} />
      </div>
    </div>
  );
}
