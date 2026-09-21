const PREFIX = "borderline:best:";

function keyFor(mode, roundLabel, stateName, difficulty) {
  const base =
    mode === "counties" ? `counties:${stateName}:${roundLabel}` : `states:${roundLabel}`;
  return `${PREFIX}${base}:${difficulty}`;
}

export function getBestScore(mode, roundLabel, stateName, difficulty) {
  try {
    const raw = localStorage.getItem(keyFor(mode, roundLabel, stateName, difficulty));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setBestScore(mode, roundLabel, stateName, difficulty, score, total) {
  try {
    const key = keyFor(mode, roundLabel, stateName, difficulty);
    const existing = getBestScore(mode, roundLabel, stateName, difficulty);
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
