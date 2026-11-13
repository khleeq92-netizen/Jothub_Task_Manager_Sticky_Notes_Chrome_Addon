// Runs in Chrome's offscreen document (offscreen.html). The service worker
// cannot play audio, so it opens this hidden page to sound the reminder
// chime. Chrome-only by nature, which is why it lives in src/platform/.

const api: typeof chrome = (globalThis as any).chrome;

const RATE = 22050;
const REPEAT_EVERY_MS = 3000;
const MAX_PLAYS = 10; // about 30 seconds, then it goes quiet on its own

/** A short, bright two-note chime, played twice, as a WAV file. */
function chimeWav(): Blob {
  const notes = [
    [0.0, 880],
    [0.18, 1318.5],
    [0.6, 880],
    [0.78, 1318.5],
  ];
  const length = Math.round(RATE * 1.5);
  const samples = new Float32Array(length);
  for (const [start, freq] of notes) {
    const from = Math.round(start * RATE);
    for (let i = 0; from + i < length && i < RATE * 0.7; i++) {
      const t = i / RATE;
      const envelope = Math.min(1, t * 200) * Math.exp(-t * 6);
      samples[from + i] += envelope * (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t));
    }
  }
  const buffer = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (offset: number, value: string) => [...value].forEach((c, i) => buffer.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  buffer.setUint32(4, 36 + length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  buffer.setUint32(16, 16, true);
  buffer.setUint16(20, 1, true); // PCM
  buffer.setUint16(22, 1, true); // mono
  buffer.setUint32(24, RATE, true);
  buffer.setUint32(28, RATE * 2, true);
  buffer.setUint16(32, 2, true);
  buffer.setUint16(34, 16, true);
  text(36, 'data');
  buffer.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) buffer.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * 0.45)) * 0x7fff, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

const audio = new Audio(URL.createObjectURL(chimeWav()));
let timer: ReturnType<typeof setInterval> | undefined;

async function play(): Promise<boolean> {
  clearInterval(timer);
  let plays = 0;
  const once = async () => {
    audio.currentTime = 0;
    await audio.play();
    if (++plays >= MAX_PLAYS) clearInterval(timer);
  };
  try {
    await once();
  } catch {
    return false;
  }
  timer = setInterval(() => void once().catch(() => clearInterval(timer)), REPEAT_EVERY_MS);
  return true;
}

api.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'jh-offscreen') return undefined;
  if (message.action === 'play') {
    void play().then(respond);
    return true;
  }
  if (message.action === 'status') respond({ playing: !audio.paused || audio.currentTime > 0 });
  return undefined;
});
