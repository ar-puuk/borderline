// Lifetime per-item accuracy, across every game ever played - not just the
// current session's best score. Powers a "you struggle most with..." list
// on the start screen so practice can actually target weak spots instead of
// re-rolling the same random order every time.
const STORAGE_KEY = "borderline:stats:v1";
const MIN_ATTEMPTS = 2; // avoid a single unlucky miss dominating the list

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore - stats are a nicety, not required for the game to function
  }
}

function keyFor(mode, stateName, name) {
  return mode === "counties" ? `counties:${stateName}:${name}` : `states:${name}`;
}

/** Call once per guess. `label` is what to display later (same as `name`
 * here, kept separate in case a future caller wants a different display
 * form than the lookup key). */
export function recordAttempt(mode, stateName, name, hit) {
  const data = readAll();
  const key = keyFor(mode, stateName, name);
  const entry = data[key] || { label: name, attempts: 0, misses: 0 };
  entry.attempts += 1;
  if (!hit) entry.misses += 1;
  data[key] = entry;
  writeAll(data);
}

/** Top `limit` weakest items for the given scope (states, or one state's
 * counties), by miss rate, only counting items with enough attempts to be
 * meaningful. Ties broken toward more attempts (more confidence). */
export function getWeakest(mode, stateName, limit = 5) {
  const data = readAll();
  const prefix = mode === "counties" ? `counties:${stateName}:` : "states:";
  const entries = Object.entries(data)
    .filter(([key, e]) => key.startsWith(prefix) && e.attempts >= MIN_ATTEMPTS)
    .map(([, e]) => ({ label: e.label, attempts: e.attempts, misses: e.misses, rate: e.misses / e.attempts }));

  entries.sort((a, b) => b.rate - a.rate || b.attempts - a.attempts);
  return entries.filter((e) => e.rate > 0).slice(0, limit);
}
