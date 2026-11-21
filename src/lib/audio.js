// Audio utility functions: duration, trimming, speed change, and slicing using Web Audio API

// Decode an uploaded audio File and return its duration in seconds.
export function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      if (!isFinite(d) || d <= 0) reject(new Error("Could not read audio duration"));
      else resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load audio file"));
    };
    el.src = url;
  });
}

// Encode an AudioBuffer to a standard 16-bit PCM WAV File/Blob
export function audioBufferToWav(buffer, optFilename = "processed_audio.wav") {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF Chunk Descriptor
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // "fmt " sub-chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM audio samples
  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelData[ch][i];
      // Clamp between -1 and 1
      sample = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit signed integer (-32768 to 32767)
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new File([arrayBuffer], optFilename, { type: "audio/wav" });
}

// Modify an audio file: trim [startTime, endTime] and/or adjust playback speed (0.25x - 4x)
// Uses OfflineAudioContext with pitch-safe resampling and time clipping.
export async function processAudioFile(file, options = {}) {
  const {
    start = 0,
    end = null,
    speed = 1.0,
    filename = "audio_edited.wav",
  } = options;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("AudioContext is not supported in this browser.");

  const tempCtx = new AC();
  const fileBytes = await file.arrayBuffer();
  const decoded = await tempCtx.decodeAudioData(fileBytes);
  if (tempCtx.close) await tempCtx.close();

  const totalDuration = decoded.duration;
  const clipStart = Math.max(0, Math.min(totalDuration, Number(start) || 0));
  const clipEnd = end != null && end > clipStart ? Math.min(totalDuration, Number(end)) : totalDuration;
  const clipDuration = Math.max(0.1, clipEnd - clipStart);

  const cleanSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1.0));
  const newDuration = clipDuration / cleanSpeed;

  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;
  const outputLength = Math.max(1, Math.round(newDuration * sampleRate));

  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OAC(numChannels, outputLength, sampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.playbackRate.value = cleanSpeed;

  source.connect(offlineCtx.destination);
  // Start playing from clipStart for the duration of clipDuration
  source.start(0, clipStart, clipDuration);

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWav(renderedBuffer, filename || file.name || "audio_edited.wav");
}
