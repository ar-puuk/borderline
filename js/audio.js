const STORAGE_KEY = "borderline:sound";

let ctx = null;

function getCtx() {
  if (!ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioContextClass();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function isEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function setEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
}

/** A short synthesized tone with a quick attack/decay envelope (avoids the
 * click you'd get from starting/stopping a gain node at full volume). */
function tone(audioCtx, startTime, freq, duration, type, peakGain) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playHit() {
  if (!isEnabled()) return;
  try {
    const audioCtx = getCtx();
    const t = audioCtx.currentTime;
    tone(audioCtx, t, 784, 0.11, "sine", 0.18); // G5
    tone(audioCtx, t + 0.09, 1047, 0.16, "sine", 0.16); // C6
  } catch {
    // Web Audio unavailable or blocked - fail silently, sound is a nicety
  }
}

export function playMiss() {
  if (!isEnabled()) return;
  try {
    const audioCtx = getCtx();
    const t = audioCtx.currentTime;
    tone(audioCtx, t, 220, 0.16, "triangle", 0.15);
    tone(audioCtx, t + 0.1, 165, 0.22, "triangle", 0.13);
  } catch {
    // ignore
  }
}

export function vibrateHit() {
  if (!isEnabled()) return;
  try {
    navigator.vibrate?.(12);
  } catch {
    // ignore
  }
}

export function vibrateMiss() {
  if (!isEnabled()) return;
  try {
    navigator.vibrate?.([12, 60, 12]);
  } catch {
    // ignore
  }
}

export function isSoundEnabled() {
  return isEnabled();
}

/** Flips the stored preference and returns the new enabled state. */
export function toggleSound() {
  const next = !isEnabled();
  setEnabled(next);
  return next;
}
