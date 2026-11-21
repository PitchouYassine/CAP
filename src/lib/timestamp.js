// Parse an image filename into a start time in seconds, or null if it doesn't
// encode a timestamp. Naming is colon-free (Windows-safe): mm-ss / mm_ss,
// hh-mm-ss, bare mmss (3-4 digits), or bare seconds (1-2 digits). A trailing
// 3-digit part is milliseconds for sub-second precision: mm-ss-mmm (e.g.
// "00-04-289" = 4.289s) or hh-mm-ss-mmm.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function naturalCompareFilenames(a, b) {
  const nameA = typeof a === "string" ? a : (a?.name || "");
  const nameB = typeof b === "string" ? b : (b?.name || "");
  return collator.compare(nameA, nameB);
}

// Returns a numeric start time ONLY if the filename contains an explicit
// mm-ss / hh-mm-ss / mm-ss-mmm timecode pattern (with - _ or : separators),
// NOT bare sequential scene numbers like "1.png", "2.png", "3.png".
export function parseExplicitTimecode(filename) {
  if (!filename || typeof filename !== "string") return null;
  let base = filename.split(/[\\/]/).pop().split(".")[0].trim();
  // Strip browser duplicate suffix like " (1)" or "_copy"
  base = base.replace(/\s*\(\d+\)$/, "").replace(/[-_]\d{8,}$/, "").trim();

  let m;
  // Exact match: hh-mm-ss-mmm
  if ((m = base.match(/^(\d+)[-_:](\d{1,2})[-_:](\d{1,2})[-_:](\d{3})$/))) {
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
  }
  // Exact match: mm-ss-mmm
  if ((m = base.match(/^(\d+)[-_:](\d{1,2})[-_:](\d{3})$/))) {
    return (+m[1]) * 60 + (+m[2]) + (+m[3]) / 1000;
  }
  // Exact match: hh-mm-ss
  if ((m = base.match(/^(\d+)[-_:](\d{1,2})[-_:](\d{1,2})$/))) {
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  }
  // Exact match: mm-ss (where seconds is 00..59)
  if ((m = base.match(/^(\d+)[-_:](\d{2})$/))) {
    const mins = +m[1];
    const secs = +m[2];
    if (secs < 60) return mins * 60 + secs;
  }
  // Embedded timecode inside a longer name, e.g. "scene_01_00-12.png" or "02 - 01-05-250"
  if ((m = base.match(/(?:^|[^\d])(\d{1,2})[-_:](\d{2})(?:[-_:](\d{3}))?(?:$|[^\d])/))) {
    const mins = +m[1];
    const secs = +m[2];
    const ms = m[3] ? (+m[3]) / 1000 : 0;
    if (secs < 60) return mins * 60 + secs + ms;
  }
  return null;
}

export function parseTimestampName(filename) {
  if (!filename || typeof filename !== "string") return null;
  const explicit = parseExplicitTimecode(filename);
  if (explicit != null) return explicit;

  let base = filename.split(/[\\/]/).pop().split(".")[0].trim();
  base = base.replace(/\s*\(\d+\)$/, "").replace(/[-_]\d{8,}$/, "").trim();

  let m;
  // mm-ss with 1-digit seconds (e.g. "0-5")
  if ((m = base.match(/^(\d+)[-_](\d{1,2})$/))) {
    return (+m[1]) * 60 + (+m[2]);
  }
  // bare digits
  if ((m = base.match(/^\d+$/))) {
    if (base.length >= 3) {
      const secs = +base.slice(-2);
      const mins = +base.slice(0, -2);
      return mins * 60 + secs;
    }
    return +base;
  }
  return null;
}

// Detect whether a list of uploaded files has true timecode filenames (e.g. 0-00.png, 0-04.png)
// vs sequential scene numbers (e.g. 1.png, 2.png, 3.png or scene_1.png, scene_2.png) or arbitrary names.
export function analyzeUploadedMediaBatch(files) {
  if (!files || !files.length) return { mode: "even", parsed: [] };

  const explicitTimes = files.map((f) => parseExplicitTimecode(f.name));
  const explicitCount = explicitTimes.filter((t) => t != null).length;

  // If the majority of files have explicit mm-ss / hh-mm-ss timecodes (like 0-00.png, 0-04.png)
  if (explicitCount > 0 && explicitCount >= Math.ceil(files.length * 0.6)) {
    return {
      mode: "timecode",
      parsed: files.map((f, idx) => ({
        file: f,
        seconds: explicitTimes[idx] != null ? explicitTimes[idx] : parseTimestampName(f.name),
      })),
    };
  }

  // Check if bare numbers are non-consecutive timestamps starting at 0 (e.g. 0.png, 4.png, 9.png)
  const bareTimes = files.map((f) => parseTimestampName(f.name));
  const allBareValid = bareTimes.every((t) => t != null);
  if (allBareValid && files.length > 1) {
    const sorted = [...bareTimes].sort((a, b) => a - b);
    const startsAtZero = sorted[0] === 0;
    // Check if they are consecutive integers (0,1,2,3... or 1,2,3,4...) -> those are scene indices, NOT seconds!
    let isConsecutiveStep1 = true;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs((sorted[i] - sorted[i - 1]) - 1) > 0.001) {
        isConsecutiveStep1 = false;
        break;
      }
    }
    if (startsAtZero && !isConsecutiveStep1) {
      return {
        mode: "timecode",
        parsed: files.map((f, idx) => ({ file: f, seconds: bareTimes[idx] })),
      };
    }
  }

  // Otherwise: sequential scene numbers (1.png, 2.png...) or arbitrary image names ->
  // sort naturally and distribute evenly across the timeline!
  const sortedFiles = [...files].sort(naturalCompareFilenames);
  return {
    mode: "even",
    parsed: sortedFiles.map((f) => ({ file: f, seconds: null })),
  };
}
