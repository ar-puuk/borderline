import { loadMapData } from "./mapData.js";
import { MapRenderer, COLORS } from "./renderer.js";
import { Game } from "./game.js";
import { getBestScore, setBestScore } from "./storage.js";
import { initTheme } from "./theme.js";

const els = {
  brandHomeBtn: document.getElementById("brand-home-btn"),
  themeToggle: document.getElementById("theme-toggle"),

  screenStart: document.getElementById("screen-start"),
  screenGame: document.getElementById("screen-game"),
  screenEnd: document.getElementById("screen-end"),

  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  difficultyButtons: Array.from(document.querySelectorAll("[data-difficulty]")),
  statePickerField: document.getElementById("state-picker-field"),
  statePickerWrap: document.getElementById("state-picker-wrap"),
  statePickerBtn: document.getElementById("state-picker-btn"),
  statePickerLabel: document.getElementById("state-picker-label"),
  statePickerList: document.getElementById("state-picker-list"),
  roundsRow: document.getElementById("rounds-row"),
  roundButtons: Array.from(document.querySelectorAll("[data-rounds]")),
  bestScoreNote: document.getElementById("best-score-note"),
  btnPlay: document.getElementById("btn-play"),
  btnPlayLabel: document.getElementById("btn-play-label"),

  gameContext: document.getElementById("game-context"),
  promptText: document.getElementById("prompt-text"),
  statScore: document.getElementById("stat-score"),
  statRound: document.getElementById("stat-round"),
  statStreak: document.getElementById("stat-streak"),
  roundProgressFill: document.getElementById("round-progress-fill"),
  canvas: document.getElementById("map-canvas"),
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
};

const state = {
  mapData: null,
  mode: "states",
  difficulty: "easy", // "easy" keeps every answered region marked; "hard" clears each one on advance
  stateName: null,
  roundLabel: "25",
  stateRoundLabel: "25",
  countyRoundLabel: "25",
  renderer: null,
  game: null,
  awaitingConfirmation: false,
  advanceTimer: null,
};

function showScreen(name) {
  for (const s of [els.screenStart, els.screenGame, els.screenEnd]) s.hidden = true;
  if (name === "start") els.screenStart.hidden = false;
  if (name === "game") els.screenGame.hidden = false;
  if (name === "end") els.screenEnd.hidden = false;
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

function updateBestScoreNote() {
  const best = getBestScore(state.mode, state.roundLabel, state.stateName, state.difficulty);
  els.bestScoreNote.textContent = best
    ? `Best: ${best.score}/${best.total} (${best.percent}%)`
    : "No best score yet for this mode.";
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
  return modeChip + difficultyChip;
}

els.modeButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectMode(btn.dataset.mode))
);
els.difficultyButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectDifficulty(btn.dataset.difficulty))
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
  updateBestScoreNote();
  showScreen("start");
});
els.brandHomeBtn.addEventListener("click", () => {
  clearAdvanceTimer();
  updateBestScoreNote();
  showScreen("start");
});
initTheme(els.themeToggle);

// ---------- Game screen ----------

function buildPool() {
  if (state.mode === "states") {
    return state.mapData.playableStates.map((s) => ({ name: s.name, feature: s.feature }));
  }
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
  const count = resolveCount(pool.length);

  state.game = new Game({
    mode: state.mode,
    stateName: state.stateName,
    pool,
    roundLabel: state.roundLabel,
  });
  state.game.order = state.game.order.slice(0, count);
  state.game.total = count;

  els.gameContext.innerHTML = contextChipsHtml();

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

  showScreen("game");
  state.renderer.resize();
  nextRound();
}

function historyToLayer(h) {
  return {
    feature: h.feature,
    fill: h.hit ? "rgba(47, 206, 119, 0.25)" : "rgba(240, 80, 63, 0.25)",
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

function handleCanvasPoint(clientX, clientY) {
  const g = state.game;
  if (!g || g.awaitingNext) return;

  const point = state.renderer.toMapPoint(clientX, clientY);
  const hit = state.renderer.pointInFeature(g.current.feature, point);
  const result = g.guess(hit, point);
  updateStats();
  if (state.difficulty === "hard") {
    showLatestResultOnly();
  } else {
    showAccumulatedHistory();
  }

  if (result.hit) {
    state.renderer.setMarker(null);
    state.renderer.render();
    announce(`Correct — that's ${result.target.name}. Streak ${g.streak}.`);
    state.advanceTimer = setTimeout(() => proceed(), 650);
  } else {
    state.renderer.setMarker(point);
    state.renderer.render();
    announce(`Not quite. That was ${result.target.name}.`);
    els.feedbackText.textContent = `That was ${result.target.name}.`;
    els.feedbackPanel.hidden = false;
    state.awaitingConfirmation = true;
    els.btnNext.focus();
  }
}

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
  const g = state.game;
  const percent = g.total > 0 ? Math.round((g.score / g.total) * 100) : 0;
  els.endContext.innerHTML = contextChipsHtml();
  els.endScore.textContent = String(g.score);
  els.endTotal.textContent = String(g.total);
  els.endPercent.textContent = String(percent);
  els.endBarFill.style.width = "0%";
  requestAnimationFrame(() => {
    els.endBarFill.style.width = `${percent}%`;
  });

  const best = setBestScore(
    state.mode,
    state.roundLabel,
    state.stateName,
    state.difficulty,
    g.score,
    g.total
  );
  els.endBest.textContent = best
    ? best.isNewBest
      ? "New best score!"
      : `Best: ${best.score}/${best.total} (${best.percent}%)`
    : "";

  if (g.missed.length > 0) {
    els.endMissedWrap.hidden = false;
    els.endMissedList.innerHTML = g.missed.map((n) => `<li>${n}</li>`).join("");
  } else {
    els.endMissedWrap.hidden = true;
    els.endMissedList.innerHTML = "";
  }

  showScreen("end");
  announce(`Round complete. Score ${g.score} out of ${g.total}, ${percent} percent.`);
}

els.canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  handleCanvasPoint(e.clientX, e.clientY);
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

window.addEventListener("resize", () => {
  if (!els.screenGame.hidden && state.renderer) state.renderer.resize();
});

// ---------- Boot ----------

async function boot() {
  els.btnPlay.disabled = true;
  els.btnPlayLabel.textContent = "Loading map…";
  try {
    state.mapData = await loadMapData();
    populateStatePicker();
    updateRoundsAvailability();
    els.btnPlay.disabled = false;
    els.btnPlayLabel.textContent = "Play";
  } catch (err) {
    els.btnPlayLabel.textContent = "Failed to load map data";
    console.error(err);
  }
}

selectMode(state.mode);
boot();
