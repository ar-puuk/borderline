import { pointInFeature } from "./geometry.js";

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

  guess(mapX, mapY) {
    const target = this.current;
    const hit = pointInFeature(target.feature, mapX, mapY);
    if (hit) {
      this.score += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.streak = 0;
      this.missed.push(target.name);
    }
    this.awaitingNext = true;
    this.lastResult = { hit, target, guessPoint: { x: mapX, y: mapY } };
    return this.lastResult;
  }

  hasNextRound() {
    return this.index < this.total - 1;
  }
}
