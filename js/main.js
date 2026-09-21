import { loadStatesData, loadCountiesData } from "./mapData.js";
import { MapRenderer, COLORS, getMissPattern } from "./renderer.js";
import { Game } from "./game.js";
import { getBestScore, setBestScore } from "./storage.js";
import { initTheme } from "./theme.js";
import { playHit, playMiss, vibrateHit, vibrateMiss, isSoundEnabled, toggleSound } from "./audio.js";
import { recordAttempt, getWeakest } from "./stats.js";

const els = {
  brandHomeBtn: document.getElementById("brand-home-btn"),
  themeToggle: document.getElementById("theme-toggle"),
  soundToggle: document.getElementById("sound-toggle"),

  screenStart: document.getElementById("screen-start"),
  screenGame: document.getElementById("screen-game"),
  screenEnd: document.getElementById("screen-end"),

  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  difficultyButtons: Array.from(document.querySelectorAll("[data-difficulty]")),
  timedButtons: Array.from(document.querySelectorAll("[data-timed]")),
  roundsField: document.getElementById("rounds-field"),
  statePickerField: document.getElementById("state-picker-field"),
  statePickerWrap: document.getElementById("state-picker-wrap"),
  statePickerBtn: document.getElementById("state-picker-btn"),
  statePickerLabel: document.getElementById("state-picker-label"),
  statePickerList: document.getElementById("state-picker-list"),
  roundsRow: document.getElementById("rounds-row"),
  roundButtons: Array.from(document.querySelectorAll("[data-rounds]")),
  bestScoreNote: document.getElementById("best-score-note"),
  weakSpots: document.getElementById("weak-spots"),
  weakSpotsChips: document.getElementById("weak-spots-chips"),
  btnPlay: document.getElementById("btn-play"),
  btnPlayLabel: document.getElementById("btn-play-label"),

  gameContext: document.getElementById("game-context"),
  promptText: document.getElementById("prompt-text"),
  statScore: document.getElementById("stat-score"),
  statRoundWrap: document.getElementById("stat-round-wrap"),
  statRound: document.getElementById("stat-round"),
  statStreak: document.getElementById("stat-streak"),
  statTimerWrap: document.getElementById("stat-timer-wrap"),
  statTimer: document.getElementById("stat-timer"),
  roundProgressWrap: document.getElementById("round-progress-wrap"),
  roundProgressFill: document.getElementById("round-progress-fill"),
  answerForm: document.getElementById("answer-form"),
  answerInput: document.getElementById("answer-input"),
  answerOptions: document.getElementById("answer-options"),
  canvas: document.getElementById("map-canvas"),
  btnZoomIn: document.getElementById("btn-zoom-in"),
  btnZoomOut: document.getElementById("btn-zoom-out"),
  btnZoomReset: document.getElementById("btn-zoom-reset"),
  feedbackPanel: document.getElementById("feedback-panel"),
  feedbackText: document.getElementById("feedback-text"),
  btnNext: document.getElementById("btn-next"),
  liveRegion: document.getElementById("live-region"),
  btnQuit: document.getElementById("btn-quit"),

  endContext: document.getElementById("end-context"),
  endScore: document.getElementById("end-score"),
  endTotal: document.getElementById("end-total"),
  endPercent: document.getElementById("end-percent"),
  endBarFill: document.getElementById("end-bar-fill"),
  endBest: document.getElementById("end-best"),
  endMissedWrap: document.getElementById("end-missed-wrap"),
  endMissedList: document.getElementById("end-missed-list"),
  btnPlayAgain: document.getElementById("btn-play-again"),
  btnChangeMode: document.getElementById("btn-change-mode"),
  btnRetryMissed: document.getElementById("btn-retry-missed"),
  btnShare: document.getElementById("btn-share"),
  btnShareLabel: document.getElementById("btn-share-label"),
  btnCopySetup: document.getElementById("btn-copy-setup"),
  btnCopySetupLabel: document.getElementById("btn-copy-setup-label"),
};

// Captured once, before any of our own history.replaceState calls (see
// syncUrlToSetup()) could touch the address bar - this is the one true
// snapshot of whatever setup a shared link asked for.
const initialUrlParams = new URLSearchParams(window.location.search);

const BLITZ_SECONDS = 60;

const state = {
  mapData: null,
  mode: "states",
  difficulty: "easy", // "easy" keeps every answered region marked; "hard" clears each one on advance
  timed: false, // Blitz mode: race a countdown instead of a fixed round count
  stateName: null,
  roundLabel: "25",
  stateRoundLabel: "25",
  countyRoundLabel: "25",
  renderer: null,
  game: null,
  isBlitzRound: false, // whether the in-progress/just-finished game is timed (retry sessions never are)
  blitzInterval: null,
  blitzDeadline: null, // wall-clock Date.now() the round ends at, not a tick countdown
  awaitingConfirmation: false,
  advanceTimer: null,
  usingTypedInput: false, // whichever input method was used last becomes the one auto-focused each round
  lastMissedPool: null,
  countiesLoadPromise: null, // in-flight/settled promise for the deferred counties fetch
};

const ALL_SCREENS = () => [els.screenStart, els.screenGame, els.screenEnd];
const SCREEN_BY_NAME = () => ({ start: els.screenStart, game: els.screenGame, end: els.screenEnd });
const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// `onVisible` runs right after `target.hidden` is cleared (so layout reads
// like getBoundingClientRect() are correct), which may be after the leaving
// screen's fade-out animation, not necessarily synchronously.
function showScreen(name, onVisible) {
  const target = SCREEN_BY_NAME()[name];
  const current = ALL_SCREENS().find((s) => !s.hidden);

  // Reset any leftover transition classes from an interrupted switch.
  for (const s of ALL_SCREENS()) s.classList.remove("screen-leaving", "screen-entering");

  if (!current || current === target || prefersReducedMotion()) {
    for (const s of ALL_SCREENS()) s.hidden = s !== target;
    if (onVisible) onVisible();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    current.classList.remove("screen-leaving");
    current.hidden = true;
    target.hidden = false;
    target.classList.add("screen-entering");
    if (onVisible) onVisible();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => target.classList.remove("screen-entering"));
    });
  };

  current.classList.add("screen-leaving");
  current.addEventListener("transitionend", finish, { once: true });
  // Safety net: a backgrounded/throttled tab can pause CSS transitions
  // indefinitely (observed with Blitz's timeout firing while the tab isn't
  // focused), and a transitionend that never fires would otherwise strand
  // the UI on the old screen forever. Force the swap once the 220ms
  // transition should clearly be done regardless of whether it announced it.
  setTimeout(finish, 400);
}

function announce(text) {
  els.liveRegion.textContent = text;
}

// ---------- Start screen ----------

function populateStatePicker() {
  const names = state.mapData.playableStates.map((s) => s.name).sort();
  els.statePickerList.innerHTML = names
    .map(
      (n, i) =>
        `<li role="option" id="state-opt-${i}" class="select-option" data-value="${n}" aria-selected="false">${n}</li>`
    )
    .join("");
  if (!state.stateName) state.stateName = names[0];
  selectState(state.stateName);
}

function selectState(name) {
  state.stateName = name;
  els.statePickerLabel.textContent = name;
  for (const li of els.statePickerList.children) {
    li.setAttribute("aria-selected", String(li.dataset.value === name));
  }
}

function setActiveStateOption(li) {
  const prev = els.statePickerList.querySelector(".is-active");
  if (prev) prev.classList.remove("is-active");
  if (!li) return;
  li.classList.add("is-active");
  els.statePickerList.setAttribute("aria-activedescendant", li.id);
  li.scrollIntoView({ block: "nearest" });
}

function openStatePicker() {
  els.statePickerList.hidden = false;
  els.statePickerBtn.setAttribute("aria-expanded", "true");
  const current =
    els.statePickerList.querySelector(`[data-value="${CSS.escape(state.stateName)}"]`) ||
    els.statePickerList.firstElementChild;
  setActiveStateOption(current);
  els.statePickerList.focus();
  document.addEventListener("pointerdown", onStatePickerOutsideClick, true);
}

function closeStatePicker() {
  els.statePickerList.hidden = true;
  els.statePickerBtn.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", onStatePickerOutsideClick, true);
}

function onStatePickerOutsideClick(e) {
  if (!els.statePickerWrap.contains(e.target)) closeStatePicker();
}

let statePickerTypeahead = "";
let statePickerTypeaheadTimer = null;

els.statePickerBtn.addEventListener("click", () => {
  if (els.statePickerList.hidden) openStatePicker();
  else closeStatePicker();
});

els.statePickerList.addEventListener("click", (e) => {
  const li = e.target.closest("[role='option']");
  if (!li) return;
  selectState(li.dataset.value);
  updateRoundsAvailability();
  closeStatePicker();
  els.statePickerBtn.focus();
});

els.statePickerList.addEventListener("keydown", (e) => {
  const options = Array.from(els.statePickerList.children);
  const activeId = els.statePickerList.getAttribute("aria-activedescendant");
  let idx = options.findIndex((o) => o.id === activeId);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActiveStateOption(options[Math.min(options.length - 1, idx + 1)]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActiveStateOption(options[Math.max(0, idx - 1)]);
  } else if (e.key === "Home") {
    e.preventDefault();
    setActiveStateOption(options[0]);
  } else if (e.key === "End") {
    e.preventDefault();
    setActiveStateOption(options[options.length - 1]);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (idx >= 0) {
      selectState(options[idx].dataset.value);
      updateRoundsAvailability();
    }
    closeStatePicker();
    els.statePickerBtn.focus();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeStatePicker();
    els.statePickerBtn.focus();
  } else if (e.key === "Tab") {
    closeStatePicker();
  } else if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
    clearTimeout(statePickerTypeaheadTimer);
    statePickerTypeahead += e.key.toLowerCase();
    statePickerTypeaheadTimer = setTimeout(() => (statePickerTypeahead = ""), 600);
    const startIdx = (idx + 1) % options.length;
    const ordered = [...options.slice(startIdx), ...options.slice(0, startIdx)];
    const match = ordered.find((o) => o.textContent.toLowerCase().startsWith(statePickerTypeahead));
    if (match) setActiveStateOption(match);
  }
});

function currentPoolLength() {
  if (!state.mapData) return 0;
  if (state.mode === "states") return state.mapData.playableStates.length;
  if (!state.mapData.countiesByState) return 0; // still loading
  const list = state.mapData.countiesByState.get(state.stateName);
  return list ? list.length : 0;
}

function updateRoundsAvailability() {
  if (!state.mapData) {
    updateBestScoreNote();
    return;
  }
  const len = currentPoolLength();
  let selectedStillValid = true;
  for (const btn of els.roundButtons) {
    const val = btn.dataset.rounds;
    if (val === "all") {
      btn.hidden = false;
      continue;
    }
    const n = Number(val);
    btn.hidden = n > len;
    if (btn.hidden && state.roundLabel === val) selectedStillValid = false;
  }
  if (!selectedStillValid) selectRoundLabel("all");
  updateBestScoreNote();
}

// County topology is ~840KB and unprojected (see mapData.js) - a States-
// only player never needs it, so it's fetched lazily on first switching to
// Counties mode rather than blocking initial load like States data does.
function ensureCountiesData() {
  if (!state.mapData || state.mapData.countiesByState) return Promise.resolve();
  if (state.countiesLoadPromise) return state.countiesLoadPromise;

  els.btnPlay.disabled = true;
  els.btnPlayLabel.textContent = "Loading counties…";
  state.countiesLoadPromise = loadCountiesData(state.mapData.states)
    .then((counties) => {
      Object.assign(state.mapData, counties);
      els.btnPlay.disabled = false;
      els.btnPlayLabel.textContent = "Play";
      updateRoundsAvailability();
    })
    .catch((err) => {
      els.btnPlayLabel.textContent = "Failed to load county data";
      console.error(err);
    });
  return state.countiesLoadPromise;
}

function selectMode(mode) {
  state.mode = mode;
  for (const btn of els.modeButtons) {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  els.statePickerField.hidden = mode !== "counties";
  state.roundLabel = mode === "states" ? state.stateRoundLabel : state.countyRoundLabel;
  for (const btn of els.roundButtons) {
    btn.classList.toggle("is-selected", btn.dataset.rounds === state.roundLabel);
  }
  if (mode === "counties") ensureCountiesData();
  updateRoundsAvailability();
}

function selectRoundLabel(label) {
  state.roundLabel = label;
  if (state.mode === "states") state.stateRoundLabel = label;
  else state.countyRoundLabel = label;
  for (const btn of els.roundButtons) {
    const on = btn.dataset.rounds === label;
    btn.classList.toggle("is-selected", on);
  }
  updateBestScoreNote();
}

function selectDifficulty(difficulty) {
  state.difficulty = difficulty;
  for (const btn of els.difficultyButtons) {
    const on = btn.dataset.difficulty === difficulty;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  updateBestScoreNote();
}

function selectTimed(timed) {
  state.timed = timed === "on";
  for (const btn of els.timedButtons) {
    const on = btn.dataset.timed === timed;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  // Blitz plays through the whole pool until the clock runs out, so a
  // fixed round count doesn't apply while it's selected.
  els.roundsField.hidden = state.timed;
  updateBestScoreNote();
}

function updateBestScoreNote() {
  const roundLabel = state.timed ? "blitz" : state.roundLabel;
  const best = getBestScore(state.mode, roundLabel, state.stateName, state.difficulty);
  els.bestScoreNote.textContent = best
    ? `Best: ${best.score}/${best.total} (${best.percent}%)`
    : "No best score yet for this mode.";
  updateWeakSpots();
  syncUrlToSetup();
}

// Builds the querystring for the *current* setup (mode/difficulty/timing,
// plus state when relevant) - shared by the live address-bar sync below and
// by the Copy-result/Copy-setup-link buttons, so all three ways of sharing a
// setup produce the exact same URL shape.
function buildSetupParams() {
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  params.set("difficulty", state.difficulty);
  if (state.timed) params.set("timed", "1");
  if (state.mode === "counties" && state.stateName) {
    params.set("state", state.stateName.replace(/\s+/g, "-"));
  }
  // A "retry" session's roundLabel is a one-off, not a reproducible setup -
  // share the underlying per-mode round count that led to it instead.
  const rounds =
    state.roundLabel === "retry"
      ? state.mode === "states"
        ? state.stateRoundLabel
        : state.countyRoundLabel
      : state.roundLabel;
  params.set("rounds", rounds);
  return params;
}

// Keeps the address bar reflecting the current start-screen setup, so
// copying it straight out of the browser at any point - not just via a
// Copy button - shares this exact mode/state/difficulty/rounds/timing
// combination. No-ops before mapData loads, so it can't clobber an incoming
// shared link before applyUrlSetup() has had a chance to read it.
function syncUrlToSetup() {
  if (!state.mapData) return;
  const search = "?" + buildSetupParams().toString();
  if (window.location.search !== search) {
    history.replaceState(null, "", window.location.pathname + search);
  }
}

// Reads the setup a shared link asked for (captured once in
// initialUrlParams) and applies it to the start screen. Returns a promise
// that resolves once it's actually ready to play - immediately for States
// mode, or once the lazily-loaded county data finishes for Counties mode,
// since the "rounds" value can't be validated against the pool until then.
function applyUrlSetup() {
  const params = initialUrlParams;

  const mode = (params.get("mode") || "").toLowerCase();
  if (mode === "states" || mode === "counties") selectMode(mode);

  const difficulty = (params.get("difficulty") || "").toLowerCase();
  if (difficulty === "easy" || difficulty === "hard") selectDifficulty(difficulty);

  const timed = (params.get("timed") || "").toLowerCase();
  if (timed === "1" || timed === "true") selectTimed("on");

  if (state.mode === "counties") {
    const stateParam = params.get("state");
    if (stateParam) {
      const normalized = stateParam.replace(/-/g, " ").trim().toLowerCase();
      const match = state.mapData.playableStates.find((s) => s.name.toLowerCase() === normalized);
      if (match) selectState(match.name);
    }
  }

  const applyRounds = () => {
    const rounds = (params.get("rounds") || "").toLowerCase();
    if (rounds === "10" || rounds === "25" || rounds === "all") selectRoundLabel(rounds);
  };

  if (state.mode === "counties") return ensureCountiesData().then(applyRounds);
  applyRounds();
  return Promise.resolve();
}

function updateWeakSpots() {
  const weakest = getWeakest(state.mode, state.stateName);
  els.weakSpots.hidden = weakest.length === 0;
  els.weakSpotsChips.innerHTML = weakest
    .map((w) => `<span class="chip">${w.label}</span>`)
    .join("");
}

function chip(iconId, label) {
  return `<span class="chip"><svg class="icon"><use href="#${iconId}"></use></svg>${label}</span>`;
}

function contextChipsHtml() {
  const modeChip =
    state.mode === "states"
      ? chip("icon-pin", "States")
      : chip("icon-grid", `Counties &middot; ${state.stateName}`);
  const difficultyChip = chip(
    state.difficulty === "easy" ? "icon-leaf" : "icon-flame",
    state.difficulty === "easy" ? "Easy" : "Hard"
  );
  const timedChip = state.isBlitzRound ? chip("icon-clock", "Blitz") : "";
  return modeChip + difficultyChip + timedChip;
}

els.modeButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectMode(btn.dataset.mode))
);
els.difficultyButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectDifficulty(btn.dataset.difficulty))
);
els.timedButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectTimed(btn.dataset.timed))
);
els.roundButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectRoundLabel(btn.dataset.rounds))
);
els.btnPlay.addEventListener("click", () => startGame());
els.btnChangeMode.addEventListener("click", () => {
  updateBestScoreNote();
  showScreen("start");
});
els.btnQuit.addEventListener("click", () => {
  clearAdvanceTimer();
  clearBlitzTimer();
  updateBestScoreNote();
  showScreen("start");
});
els.brandHomeBtn.addEventListener("click", () => {
  clearAdvanceTimer();
  clearBlitzTimer();
  updateBestScoreNote();
  showScreen("start");
});
initTheme(els.themeToggle);

function syncSoundToggle() {
  const enabled = isSoundEnabled();
  els.soundToggle.setAttribute("data-muted", String(!enabled));
  els.soundToggle.setAttribute("aria-pressed", String(!enabled));
  els.soundToggle.setAttribute("aria-label", enabled ? "Mute sound" : "Unmute sound");
}
els.soundToggle.addEventListener("click", () => {
  toggleSound();
  syncSoundToggle();
});
syncSoundToggle();

// ---------- Game screen ----------

function buildPool() {
  if (state.mode === "states") {
    return state.mapData.playableStates.map((s) => ({ name: s.name, feature: s.feature }));
  }
  if (!state.mapData.countiesByState) return []; // still loading; Play stays disabled until ready
  const list = state.mapData.countiesByState.get(state.stateName) || [];
  return list.map((c) => ({ name: c.name, feature: c.feature }));
}

function resolveCount(poolLength) {
  if (state.roundLabel === "all") return poolLength;
  return Math.min(Number(state.roundLabel), poolLength);
}

function startGame() {
  const pool = buildPool();
  if (pool.length === 0) return;
  const count = state.timed ? pool.length : resolveCount(pool.length);
  const roundLabel = state.timed ? "blitz" : state.roundLabel;
  launchGame(pool, count, roundLabel, state.timed);
}

function retryMissed() {
  const pool = state.lastMissedPool;
  if (!pool || pool.length === 0) return;
  launchGame(pool, pool.length, "retry", false);
}

function launchGame(pool, count, roundLabel, timed) {
  state.isBlitzRound = timed;
  state.game = new Game({
    mode: state.mode,
    stateName: state.stateName,
    pool,
    roundLabel,
  });
  state.game.order = state.game.order.slice(0, count);
  state.game.total = count;

  els.gameContext.innerHTML = contextChipsHtml();
  els.statRoundWrap.hidden = timed;
  els.statTimerWrap.hidden = !timed;
  els.roundProgressWrap.hidden = timed;
  els.answerOptions.innerHTML = pool
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${n}"></option>`)
    .join("");

  if (!state.renderer) state.renderer = new MapRenderer(els.canvas);

  if (state.mode === "states") {
    const [x0, y0, x1, y1] = state.mapData.nationBbox;
    state.renderer.setBase(state.mapData.nationFeature);
    state.renderer.setNationWorld([[x0, y0], [x1, y1]]);
  } else {
    const outline = state.mapData.stateOutlineByState.get(state.stateName);
    state.renderer.setBase(outline);
    state.renderer.setCountyWorld(outline);
  }

  showScreen("game", () => {
    state.renderer.resize();
    startBlitzTimer();
    nextRound();
  });
}

function clearBlitzTimer() {
  if (state.blitzInterval) {
    clearInterval(state.blitzInterval);
    state.blitzInterval = null;
  }
  state.blitzDeadline = null;
}

function startBlitzTimer() {
  clearBlitzTimer();
  if (!state.isBlitzRound) return;
  state.blitzDeadline = Date.now() + BLITZ_SECONDS * 1000;
  updateBlitzCountdown();
  // Ticks off a wall-clock deadline rather than decrementing a counter, so
  // it self-corrects for any drift instead of accumulating it - important
  // because a backgrounded/throttled tab can delay individual ticks by much
  // more than their nominal interval.
  state.blitzInterval = setInterval(updateBlitzCountdown, 250);
}

function updateBlitzCountdown() {
  if (!state.blitzDeadline) return;
  const remainingMs = state.blitzDeadline - Date.now();
  els.statTimer.textContent = String(Math.max(0, Math.ceil(remainingMs / 1000)));
  if (remainingMs <= 0) {
    clearBlitzTimer();
    blitzTimeUp();
  }
}

// Time's up mid-round: cut straight to the end screen. Whatever round was
// showing but never answered doesn't count - Game.endEarly() caps `total`
// at however many guesses actually made it into history.
function blitzTimeUp() {
  clearAdvanceTimer();
  state.awaitingConfirmation = false;
  els.feedbackPanel.hidden = true;
  state.game.endEarly();
  endGame();
}

function historyToLayer(h) {
  // Misses get a diagonal-hatch pattern instead of a solid fill, so hit vs.
  // miss is distinguishable by texture, not just red vs. green - which
  // red-green colorblind players (the most common form) can't reliably tell
  // apart otherwise, especially once several of each accumulate on one map.
  return {
    feature: h.feature,
    fill: h.hit ? "rgba(47, 206, 119, 0.25)" : getMissPattern(),
    stroke: h.hit ? COLORS.hit : COLORS.miss,
    lineWidth: 2,
  };
}

// Easy mode keeps every answered region marked; Hard mode only ever shows
// the round currently being revealed, and nothing at the start of a round.
function showAccumulatedHistory() {
  state.renderer.setLayers(state.game.history.map(historyToLayer));
}

function showLatestResultOnly() {
  const last = state.game.history[state.game.history.length - 1];
  state.renderer.setLayers(last ? [historyToLayer(last)] : []);
}

function nextRound() {
  clearAdvanceTimer();
  els.feedbackPanel.hidden = true;
  state.awaitingConfirmation = false;
  state.renderer.resetView();
  updateZoomButtons();
  if (state.difficulty === "hard") {
    state.renderer.setLayers([]);
  } else {
    showAccumulatedHistory();
  }
  state.renderer.setMarker(null);

  const target = state.game.next();
  els.promptText.textContent = target.name;
  els.canvas.setAttribute(
    "aria-label",
    `Outline map. Click where you think ${target.name} is located.`
  );
  updateStats();
  state.renderer.render();
  announce(`Find ${target.name}.`);
  els.answerInput.value = "";
  if (state.usingTypedInput) els.answerInput.focus();
}

function updateStats() {
  const g = state.game;
  els.statScore.textContent = String(g.score);
  els.statRound.textContent = `${g.roundNumber}/${g.total}`;
  els.statStreak.textContent = String(g.streak);
  els.roundProgressFill.style.width = `${(g.roundNumber / g.total) * 100}%`;
}

function clearAdvanceTimer() {
  if (state.advanceTimer) {
    clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
  }
}

function submitGuess(hit, point) {
  const g = state.game;
  const result = g.guess(hit, point);
  recordAttempt(state.mode, state.stateName, result.target.name, hit);
  updateStats();
  if (state.difficulty === "hard") {
    showLatestResultOnly();
  } else {
    showAccumulatedHistory();
  }

  if (result.hit) {
    state.renderer.setMarker(null);
    state.renderer.render();
    playHit();
    vibrateHit();
    announce(`Correct — that's ${result.target.name}. Streak ${g.streak}.`);
    state.advanceTimer = setTimeout(() => proceed(), 650);
  } else {
    state.renderer.setMarker(point);
    state.renderer.render();
    playMiss();
    vibrateMiss();
    announce(`Missed. The correct answer was ${result.target.name}.`);
    els.feedbackText.textContent = "Missed!";
    els.feedbackPanel.hidden = false;
    state.awaitingConfirmation = true;
    els.btnNext.focus();
    state.advanceTimer = setTimeout(() => proceed(), 1600);
  }
}

function handleCanvasPoint(clientX, clientY) {
  const g = state.game;
  if (!g || g.awaitingNext) return;
  state.usingTypedInput = false;

  const point = state.renderer.toMapPoint(clientX, clientY);
  const hit = state.renderer.pointInFeature(g.current.feature, point);
  submitGuess(hit, point);
}

// Normalizes away punctuation/case/whitespace differences ("st. louis city"
// vs "St. Louis City") without doing any fuzzy/approximate matching - the
// full name (incl. County/Parish/Borough) still has to be typed correctly.
function normalizeAnswer(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function handleTypedAnswer() {
  const g = state.game;
  if (!g || g.awaitingNext) return;
  const typed = els.answerInput.value;
  if (!typed.trim()) return;
  state.usingTypedInput = true;

  const hit = normalizeAnswer(typed) === normalizeAnswer(g.current.name);
  submitGuess(hit, null);
}

els.answerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleTypedAnswer();
});

function proceed() {
  clearAdvanceTimer();
  state.awaitingConfirmation = false;
  els.feedbackPanel.hidden = true;
  if (state.game.hasNextRound()) {
    nextRound();
  } else {
    endGame();
  }
}

function endGame() {
  clearBlitzTimer();
  const g = state.game;
  const percent = g.total > 0 ? Math.round((g.score / g.total) * 100) : 0;
  const isRetrySession = g.roundLabel === "retry";
  els.endContext.innerHTML = contextChipsHtml();
  els.endScore.textContent = String(g.score);
  els.endTotal.textContent = String(g.total);
  els.endPercent.textContent = String(percent);
  els.endBarFill.style.width = "0%";

  // A "retry missed" session's pool is a one-off subset, so comparing it
  // against the mode's normal best score wouldn't mean much - skip it.
  const best = isRetrySession
    ? null
    : setBestScore(state.mode, g.roundLabel, state.stateName, state.difficulty, g.score, g.total);
  els.endBest.textContent = best
    ? best.isNewBest
      ? "New best score!"
      : `Best: ${best.score}/${best.total} (${best.percent}%)`
    : "";

  state.lastMissedPool = g.history.filter((h) => !h.hit).map((h) => ({ name: h.name, feature: h.feature }));

  if (state.lastMissedPool.length > 0) {
    els.endMissedWrap.hidden = false;
    els.endMissedList.innerHTML = g.missed.map((n) => `<li>${n}</li>`).join("");
  } else {
    els.endMissedWrap.hidden = true;
    els.endMissedList.innerHTML = "";
  }

  showScreen("end", () => {
    requestAnimationFrame(() => {
      els.endBarFill.style.width = `${percent}%`;
    });
  });
  announce(`Round complete. Score ${g.score} out of ${g.total}, ${percent} percent.`);
}

// ---------- Map zoom / pan ----------
// A guess is a click/tap with negligible movement; anything past the drag
// threshold - or a second finger joining (pinch) - is a view gesture instead,
// and must not register as a guess on release.

const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.6;
const activePointers = new Map(); // pointerId -> { x, y } in client coords
let dragAnchor = null; // { x, y, panX, panY } for single-pointer pan
let pinchAnchor = null; // { dist, zoom } for two-pointer pinch
let isGesture = false; // true once movement/pinch exceeds the click threshold

function updateZoomButtons() {
  const zoom = state.renderer ? state.renderer.getZoom() : 1;
  els.btnZoomOut.disabled = zoom <= 1;
  els.btnZoomReset.disabled = zoom <= 1;
}

function pointerDistance() {
  const pts = Array.from(activePointers.values());
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function pointerMidpoint() {
  const pts = Array.from(activePointers.values());
  return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
}

els.canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  try {
    els.canvas.setPointerCapture(e.pointerId);
  } catch {
    // Some environments (or pointer types) don't support capture here;
    // the gesture tracking below works fine without it regardless.
  }
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 1) {
    isGesture = false;
    dragAnchor = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
  } else if (activePointers.size === 2) {
    isGesture = true; // a second finger joining is always a pinch, never a tap
    dragAnchor = null;
    pinchAnchor = { dist: pointerDistance(), zoom: state.renderer.getZoom() };
  }
});

els.canvas.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2 && pinchAnchor) {
    const dist = pointerDistance();
    const mid = pointerMidpoint();
    const rect = els.canvas.getBoundingClientRect();
    state.renderer.setZoomAt(
      mid.x - rect.left,
      mid.y - rect.top,
      pinchAnchor.zoom * (dist / pinchAnchor.dist)
    );
    updateZoomButtons();
    return;
  }

  if (dragAnchor) {
    const totalDx = e.clientX - dragAnchor.x;
    const totalDy = e.clientY - dragAnchor.y;
    if (!isGesture && Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) isGesture = true;
    if (isGesture) {
      state.renderer.panBy(e.clientX - dragAnchor.lastX, e.clientY - dragAnchor.lastY);
    }
    dragAnchor.lastX = e.clientX;
    dragAnchor.lastY = e.clientY;
  }
});

function onPointerEnd(e) {
  activePointers.delete(e.pointerId);

  if (activePointers.size === 0) {
    const wasGesture = isGesture;
    dragAnchor = null;
    pinchAnchor = null;
    isGesture = false;
    if (!wasGesture) handleCanvasPoint(e.clientX, e.clientY);
  } else if (activePointers.size === 1) {
    // Coming out of a pinch with one finger still down: re-anchor for pan
    // instead of jumping to a drag delta computed from the old anchor.
    const [[, p]] = activePointers;
    dragAnchor = { x: p.x, y: p.y, lastX: p.x, lastY: p.y };
    pinchAnchor = null;
  }
}

els.canvas.addEventListener("pointerup", onPointerEnd);
els.canvas.addEventListener("pointercancel", onPointerEnd);

els.canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0025);
    state.renderer.setZoomAt(e.clientX - rect.left, e.clientY - rect.top, state.renderer.getZoom() * factor);
    updateZoomButtons();
  },
  { passive: false }
);

els.btnZoomIn.addEventListener("click", () => {
  state.renderer.setZoomAt(
    state.renderer.cssWidth / 2,
    state.renderer.cssHeight / 2,
    state.renderer.getZoom() * ZOOM_STEP
  );
  updateZoomButtons();
});
els.btnZoomOut.addEventListener("click", () => {
  state.renderer.setZoomAt(
    state.renderer.cssWidth / 2,
    state.renderer.cssHeight / 2,
    state.renderer.getZoom() / ZOOM_STEP
  );
  updateZoomButtons();
});
els.btnZoomReset.addEventListener("click", () => {
  state.renderer.resetView();
  updateZoomButtons();
});

els.btnNext.addEventListener("click", () => proceed());
document.addEventListener("keydown", (e) => {
  if (!state.awaitingConfirmation) return;
  if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
    e.preventDefault();
    proceed();
  }
});

els.btnPlayAgain.addEventListener("click", () => startGame());
els.btnRetryMissed.addEventListener("click", () => retryMissed());

function shareUrl() {
  const url = new URL(window.location.origin + window.location.pathname);
  url.search = buildSetupParams().toString();
  return url.toString();
}

function buildShareText() {
  const g = state.game;
  const percent = g.total > 0 ? Math.round((g.score / g.total) * 100) : 0;
  const modeLabel = state.mode === "states" ? "States" : `Counties · ${state.stateName}`;
  const grid = g.history.map((h) => (h.hit ? "🟩" : "🟥")).join("");
  return `Borderline ${modeLabel} ${g.score}/${g.total} (${percent}%)\n${grid}\n${shareUrl()}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API can be unavailable (older browsers) or blocked
    // (insecure context, permissions) - fall back to the classic trick.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

els.btnShare.addEventListener("click", async () => {
  const copied = await copyToClipboard(buildShareText());
  els.btnShareLabel.textContent = copied ? "Copied!" : "Couldn't copy";
  setTimeout(() => {
    els.btnShareLabel.textContent = "Copy result";
  }, 2000);
});

els.btnCopySetup.addEventListener("click", async () => {
  const copied = await copyToClipboard(shareUrl());
  els.btnCopySetupLabel.textContent = copied ? "Copied!" : "Couldn't copy";
  setTimeout(() => {
    els.btnCopySetupLabel.textContent = "Copy link to this setup";
  }, 2000);
});

window.addEventListener("resize", () => {
  if (!els.screenGame.hidden && state.renderer) state.renderer.resize();
});

// A background/throttled tab can delay setInterval ticks well past their
// nominal 250ms - reconcile the moment the tab is visible again instead of
// waiting on whatever tick the browser eventually gets around to.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") updateBlitzCountdown();
});

// ---------- Boot ----------

async function boot() {
  els.btnPlay.disabled = true;
  els.btnPlayLabel.textContent = "Loading map…";
  try {
    state.mapData = await loadStatesData();
    populateStatePicker();
    const setupReady = applyUrlSetup();
    updateRoundsAvailability();
    els.btnPlay.disabled = false;
    els.btnPlayLabel.textContent = "Play";
    // Covers the edge case where the player switched to Counties mode
    // before this finished - selectMode()'s own call had nothing to fetch
    // yet since state.mapData was still null.
    if (state.mode === "counties") ensureCountiesData();
    await setupReady;
    if (initialUrlParams.get("play") === "1") startGame();
  } catch (err) {
    els.btnPlayLabel.textContent = "Failed to load map data";
    console.error(err);
  }
}

selectMode(state.mode);
boot();
