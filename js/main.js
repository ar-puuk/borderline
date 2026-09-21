import { loadMapData } from "./mapData.js";
import { MapRenderer, COLORS } from "./renderer.js";
import { Game } from "./game.js";
import { clientPointToMap, boundsOf } from "./geometry.js";
import { getBestScore, setBestScore } from "./storage.js";

const els = {
  screenStart: document.getElementById("screen-start"),
  screenGame: document.getElementById("screen-game"),
  screenEnd: document.getElementById("screen-end"),

  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  statePickerField: document.getElementById("state-picker-field"),
  statePicker: document.getElementById("state-picker"),
  roundsField: document.getElementById("rounds-field"),
  roundsRow: document.getElementById("rounds-row"),
  roundButtons: Array.from(document.querySelectorAll("[data-rounds]")),
  bestScoreNote: document.getElementById("best-score-note"),
  btnPlay: document.getElementById("btn-play"),

  promptText: document.getElementById("prompt-text"),
  statScore: document.getElementById("stat-score"),
  statRound: document.getElementById("stat-round"),
  statStreak: document.getElementById("stat-streak"),
  canvas: document.getElementById("map-canvas"),
  feedbackPanel: document.getElementById("feedback-panel"),
  feedbackText: document.getElementById("feedback-text"),
  btnNext: document.getElementById("btn-next"),
  liveRegion: document.getElementById("live-region"),
  btnQuit: document.getElementById("btn-quit"),

  endScore: document.getElementById("end-score"),
  endTotal: document.getElementById("end-total"),
  endPercent: document.getElementById("end-percent"),
  endBest: document.getElementById("end-best"),
  endMissedWrap: document.getElementById("end-missed-wrap"),
  endMissedList: document.getElementById("end-missed-list"),
  btnPlayAgain: document.getElementById("btn-play-again"),
  btnChangeMode: document.getElementById("btn-change-mode"),
};

const state = {
  mapData: null,
  mode: "states",
  stateName: null,
  roundLabel: "all",
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
  els.statePicker.innerHTML = names
    .map((n) => `<option value="${n}">${n}</option>`)
    .join("");
  if (!state.stateName) state.stateName = names[0];
  els.statePicker.value = state.stateName;
}

function currentPoolLength() {
  if (!state.mapData) return 0;
  if (state.mode === "states") return state.mapData.playableStates.length;
  const list = state.mapData.countiesByState.get(state.stateName);
  return list ? list.length : 0;
}

function updateRoundsAvailability() {
  if (state.mode === "states") {
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
  els.roundsField.hidden = mode === "states";
  if (mode === "states") {
    state.roundLabel = "all";
  } else {
    state.roundLabel = state.countyRoundLabel;
    for (const btn of els.roundButtons) {
      btn.classList.toggle("is-selected", btn.dataset.rounds === state.roundLabel);
    }
  }
  updateRoundsAvailability();
}

function selectRoundLabel(label) {
  state.roundLabel = label;
  state.countyRoundLabel = label;
  for (const btn of els.roundButtons) {
    const on = btn.dataset.rounds === label;
    btn.classList.toggle("is-selected", on);
  }
  updateBestScoreNote();
}

function updateBestScoreNote() {
  const best = getBestScore(state.mode, state.roundLabel, state.stateName);
  els.bestScoreNote.textContent = best
    ? `Best: ${best.score}/${best.total} (${best.percent}%)`
    : "No best score yet for this mode.";
}

els.modeButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectMode(btn.dataset.mode))
);
els.roundButtons.forEach((btn) =>
  btn.addEventListener("click", () => selectRoundLabel(btn.dataset.rounds))
);
els.statePicker.addEventListener("change", () => {
  state.stateName = els.statePicker.value;
  updateRoundsAvailability();
});
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

  if (!state.renderer) state.renderer = new MapRenderer(els.canvas);

  if (state.mode === "states") {
    const [x0, y0, x1, y1] = state.mapData.nationBbox;
    state.renderer.setBase(state.mapData.nationFeature);
    state.renderer.setWorld([[x0, y0], [x1, y1]]);
  } else {
    const outline = state.mapData.stateOutlineByState.get(state.stateName);
    state.renderer.setBase(outline);
    state.renderer.setWorld(boundsOf(outline));
  }

  showScreen("game");
  state.renderer.resize();
  nextRound();
}

function syncHistoryLayers() {
  const layers = state.game.history.map((h) => ({
    feature: h.feature,
    stroke: h.hit ? COLORS.hit : COLORS.miss,
    lineWidth: 2,
  }));
  state.renderer.setLayers(layers);
}

function nextRound() {
  clearAdvanceTimer();
  els.feedbackPanel.hidden = true;
  state.awaitingConfirmation = false;
  syncHistoryLayers();
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

  const { x, y } = clientPointToMap(els.canvas, state.renderer.transform, clientX, clientY);
  const result = g.guess(x, y);
  updateStats();
  syncHistoryLayers();

  if (result.hit) {
    state.renderer.setMarker(null);
    state.renderer.render();
    announce(`Correct — that's ${result.target.name}. Streak ${g.streak}.`);
    state.advanceTimer = setTimeout(() => proceed(), 650);
  } else {
    state.renderer.setMarker({ x, y });
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
  els.endScore.textContent = String(g.score);
  els.endTotal.textContent = String(g.total);
  els.endPercent.textContent = String(percent);

  const best = setBestScore(state.mode, state.roundLabel, state.stateName, g.score, g.total);
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
  els.btnPlay.textContent = "Loading map…";
  try {
    state.mapData = await loadMapData();
    populateStatePicker();
    updateRoundsAvailability();
    els.btnPlay.disabled = false;
    els.btnPlay.textContent = "Play";
  } catch (err) {
    els.btnPlay.textContent = "Failed to load map data";
    console.error(err);
  }
}

selectMode(state.mode);
boot();
