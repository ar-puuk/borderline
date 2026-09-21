function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor({ mode, stateName = null, pool, roundLabel }) {
    this.mode = mode; // "states" | "counties"
    this.stateName = stateName;
    this.roundLabel = roundLabel; // "10" | "25" | "all"
    this.order = shuffled(pool);
    this.total = this.order.length;
    this.index = -1;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.missed = [];
    this.awaitingNext = false;
    this.lastResult = null; // { hit, target, guessPoint }
    this.history = []; // { feature, name, hit } for every round played so far
  }

  get current() {
    return this.order[this.index];
  }

  get roundNumber() {
    return this.index + 1;
  }

  isFinished() {
    return this.index >= this.total - 1 && this.awaitingNext === false && this.lastResult !== null;
  }

  next() {
    this.index += 1;
    this.awaitingNext = false;
    this.lastResult = null;
    return this.current;
  }

  /** Record a guess. `hit` is a caller-supplied boolean (the point-in-polygon
   * test lives in geometry.js/renderer.js, since it depends on whichever
   * projection is active for the current mode); `guessPoint` is only used
   * for placing the miss marker. */
  guess(hit, guessPoint) {
    const target = this.current;
    if (hit) {
      this.score += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.streak = 0;
      this.missed.push(target.name);
    }
    this.awaitingNext = true;
    this.lastResult = { hit, target, guessPoint };
    this.history.push({ feature: target.feature, name: target.name, hit });
    return this.lastResult;
  }

  hasNextRound() {
    return this.index < this.total - 1;
  }

  /** Blitz mode: the clock ran out mid-game. Cap `total` at whatever was
   * actually answered (history only grows on guess(), so an unanswered
   * in-progress round is correctly excluded) rather than the full pool
   * count it was launched with. */
  endEarly() {
    this.total = this.history.length;
  }
}
