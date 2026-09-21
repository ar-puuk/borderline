const PREFIX = "borderline:best:";

function keyFor(mode, roundLabel, stateName) {
  return mode === "counties"
    ? `${PREFIX}counties:${stateName}:${roundLabel}`
    : `${PREFIX}states:${roundLabel}`;
}

export function getBestScore(mode, roundLabel, stateName) {
  try {
    const raw = localStorage.getItem(keyFor(mode, roundLabel, stateName));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setBestScore(mode, roundLabel, stateName, score, total) {
  try {
    const key = keyFor(mode, roundLabel, stateName);
    const existing = getBestScore(mode, roundLabel, stateName);
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    if (!existing || score > existing.score) {
      localStorage.setItem(key, JSON.stringify({ score, total, percent }));
      return { score, total, percent, isNewBest: true };
    }
    return { ...existing, isNewBest: false };
  } catch {
    return null;
  }
}
