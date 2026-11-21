// Build an ordered clip list that fully covers [0, audioDuration] from parsed
// items ({ name, seconds, empty?, preserveLeadIn? }). Returns { clips, warnings }.
//
// Ensures uploaded images always match and cover the timeline cleanly without
// dropping clips that fall at or beyond audioDuration or colliding timestamps.
export const LEAD_IN = " lead-in";

export function buildTimeline(items, audioDuration) {
  const warnings = [];
  const rawValid = [];

  const totalDur = audioDuration > 0 ? audioDuration : 30;

  for (const it of items || []) {
    const label = it.label || it.name;
    const sec = it.seconds != null && !Number.isNaN(+it.seconds) ? Math.max(0, +it.seconds) : 0;
    rawValid.push({
      name: it.name,
      seconds: sec,
      empty: !!it.empty,
      preserveLeadIn: !!it.preserveLeadIn,
      label,
    });
  }

  if (rawValid.length === 0) {
    return { clips: [], warnings };
  }

  // Sort by timestamp while keeping stable order for identical timestamps
  const valid = rawValid
    .map((item, idx) => ({ ...item, _idx: idx }))
    .sort((a, b) => (a.seconds - b.seconds) || (a._idx - b._idx));

  // If the first clip is not an intentional lead-in gap, snap the first image to 0:00
  // so the timeline always starts cleanly with the first scene instead of a black gap.
  if (valid.length > 0 && valid[0].seconds > 0 && !valid[0].preserveLeadIn && !valid[0].empty) {
    valid[0].seconds = 0;
  }

  // Check if any timestamps exceed totalDur or collide (duplicate timestamps).
  // If so, normalize/fit them smoothly into [0, totalDur] so NO image is ever dropped!
  const maxSec = valid[valid.length - 1].seconds;
  const hasDuplicates = valid.some((v, i) => i > 0 && Math.abs(v.seconds - valid[i - 1].seconds) < 0.05);
  const exceedsAudio = totalDur > 0 && maxSec >= totalDur - 0.1;

  if (exceedsAudio || hasDuplicates) {
    if (exceedsAudio && maxSec > 0 && !hasDuplicates) {
      // Scale timestamps proportionally so the last clip gets a fair slot at the end of totalDur
      const targetLastStart = totalDur * ((valid.length - 1) / valid.length);
      const scale = targetLastStart / maxSec;
      for (let i = 0; i < valid.length; i++) {
        valid[i].seconds = +(valid[i].seconds * scale).toFixed(3);
      }
    } else {
      // Ensure strictly increasing timestamps within [0, totalDur)
      const minStep = Math.min(0.5, totalDur / Math.max(2, valid.length * 2));
      for (let i = 1; i < valid.length; i++) {
        if (valid[i].seconds <= valid[i - 1].seconds + minStep) {
          valid[i].seconds = +(valid[i - 1].seconds + minStep).toFixed(3);
        }
      }
      const newMax = valid[valid.length - 1].seconds;
      if (newMax >= totalDur - minStep && newMax > 0) {
        const targetLastStart = Math.max(0, totalDur - Math.max(minStep, totalDur / valid.length));
        const scale = targetLastStart / newMax;
        for (let i = 0; i < valid.length; i++) {
          valid[i].seconds = +(valid[i].seconds * scale).toFixed(3);
        }
      }
    }
  }

  const clips = [];

  // Lead-in: only if explicitly preserved
  if (valid[0].seconds > 0.01) {
    clips.push({ name: LEAD_IN, start: 0, duration: +valid[0].seconds.toFixed(3), gap: true });
  }

  for (let i = 0; i < valid.length; i++) {
    const start = valid[i].seconds;
    const isLast = i + 1 >= valid.length;
    if (isLast && !(totalDur > 0)) continue;

    const end = isLast ? totalDur : valid[i + 1].seconds;
    const duration = Math.max(0.1, +(end - start).toFixed(3));
    clips.push({
      name: valid[i].name,
      start: +start.toFixed(3),
      duration,
      gap: !!valid[i].empty,
    });
  }

  return { clips, warnings };
}

// Clip an ordered clip list to [0, end] for export. Clips starting at or after
// `end` are dropped; the clip straddling `end` is truncated so it stops exactly
// there. `end` falsy / non-positive / at-or-beyond the total is a no-op that
// returns the original array (and unchanged clips keep their object identity).
export function trimClips(clips, end) {
  if (!(end > 0)) return clips;
  const total = clips.length ? clips[clips.length - 1].start + clips[clips.length - 1].duration : 0;
  if (end >= total) return clips;

  const out = [];
  for (const c of clips) {
    if (c.start >= end) continue;
    const dur = +(end - c.start).toFixed(3);
    out.push(dur >= c.duration ? c : { ...c, duration: dur });
  }
  return out;
}
