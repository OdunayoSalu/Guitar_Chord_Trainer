// Guitar Chord Trainer - Game page logic
(function () {
  function $(sel) { return document.querySelector(sel); }

  const els = {
    qIndex: $('#qIndex'),
    qTotal: $('#qTotal'),
    currentChord: $('#currentChord'),
    timer: $('#timer'),
    bar: $('#progressBar'),
    pauseBtn: $('#pauseBtn'),
    restartBtn: $('#restartBtn'),
    toggleSettings: $('#toggleSettings'),
    settingsPanel: $('#settingsPanel'),
    msg: $('#msg'),
    rootStr: $('#rootStr'),
    rootNote: $('#rootNote'),
    barreStyleWrap: $('#barreStyleWrap'),
    barreStyle: $('#barreStyle'),
    embellishmentsWrap: $('#embellishmentsWrap'),
    embellishments: $('#embellishments'),
    endOverlay: $('#endOverlay'),
    overlayRestart: $('#overlayRestart'),
    preStartPanel: $('#preStartPanel'),
    startSetBtn: $('#startSetBtn'),
    preRootNote: $('#preRootNote'),
    preRootString: $('#preRootString'),
    preBarreStyle: $('#preBarreStyle'),
    preBarreStyleWrap: $('#preBarreStyleWrap'),
  };

  const state = {
    settings: null,
    sessionRootString: 'E',
    sessionRootNote: 'C',
    sessionBarreStyle: null,
    qTotal: 1,
    currentQ: 1,
    running: false,
    paused: false,
    durationSec: 0,
    startMs: 0,
    rafId: 0,
    remainingSec: 0,
    countInId: 0,
    currentChord: null,
    currentEmbellishments: [],
  };
  // Minimal debug helper (toggle to true while diagnosing)
  const DEBUG = false;
  function dlog(...args) { if (DEBUG) console.log('[GCT]', ...args); }

  function stopAllTimers() {
    dlog('stopAllTimers', { rafId: state.rafId, countInId: state.countInId });
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    if (state.countInId) {
      clearInterval(state.countInId);
      state.countInId = 0;
    }
  }

  function setMsg(type, text) {
    const msg = els.msg;
    if (!msg) return;
    msg.classList.remove('hidden', 'error', 'success');
    if (!text) { msg.classList.add('hidden'); return; }
    msg.classList.add(type === 'error' ? 'error' : 'success');
    msg.textContent = text;
  }

  function updateEBarreDisabled() {
    // E-barre styles are always applicable for the set; ensure inputs are enabled
    els.settingsPanel.querySelectorAll('#field-eBarreStyles input[name="eBarreStyles"]').forEach((el) => {
      el.disabled = false;
    });
  }

  function applySettingsUI() {
    ChordTrainer.applySettingsToDOM(els.settingsPanel, state.settings);
    updateEBarreDisabled();
    updateRnbVisibilityInPanel();
  }

  function updateRnbVisibilityInPanel() {
    if (!els.settingsPanel) return;
    const panel = els.settingsPanel.querySelector('#rnbPanel');
    const toggle = els.settingsPanel.querySelector('#rnbMode');
    if (!panel || !toggle) return;
    panel.classList.toggle('hidden', !toggle.checked);
  }

  function syncSettingsEvents() {
    ChordTrainer.syncUIEvents(els.settingsPanel, (s) => {
      // Root string choices here affect next sets; current set keeps its sessionRootString
      state.settings = s;
      // Adjust total question count on-the-fly
      let newTotal = Math.max(1, Math.floor(s.count));
      if (newTotal < state.currentQ) newTotal = state.currentQ;
      state.qTotal = newTotal;
      els.qTotal.textContent = String(state.qTotal);
      // Save live so it's remembered
      ChordTrainer.saveSettings(state.settings);
      validateAndMaybeWarn();
      updateEBarreDisabled();
      updateRnbVisibilityInPanel();
      // If a chord is currently showing, update embellishments view to reflect new mode/settings
      updateEmbellishmentsUI();
      // If we're on the pre-start screen, refresh the upcoming set preview
      if (!els.preStartPanel.classList.contains('hidden')) {
        refreshPreStart();
      }
    });
  }

  function validateAndMaybeWarn() {
    const errors = ChordTrainer.validateSettings(state.settings);
    if (errors.length) {
      setMsg('error', errors[0]);
      // If invalid, disable pause (but settings can be fixed anytime)
      els.pauseBtn.disabled = true;
      return false;
    }
    setMsg('', '');
    els.pauseBtn.disabled = false;
    return true;
  }

  function updateTopStatus() {
    els.qIndex.textContent = String(state.currentQ);
    els.qTotal.textContent = String(state.qTotal);
    els.rootStr.textContent = state.sessionRootString;
    els.rootNote.textContent = state.sessionRootNote;
    if (state.sessionBarreStyle) {
      els.barreStyle.textContent = state.sessionBarreStyle;
      els.barreStyleWrap.classList.remove('hidden');
    }
  }

  function showChordOnUI(chord, barreStyle) {
    const label = chord ? ChordTrainer.formatChordLabel(chord) : '—';
    els.currentChord.textContent = label;
    if (barreStyle) {
      els.barreStyle.textContent = barreStyle;
      els.barreStyleWrap.classList.remove('hidden');
    } else {
      els.barreStyleWrap.classList.add('hidden');
    }
  }

  function updateEmbellishmentsUI() {
    if (!els.embellishmentsWrap || !els.embellishments) return;
    const s = state.settings;
    const chord = state.currentChord;
    if (!s?.rnbMode || !chord) {
      els.embellishmentsWrap.classList.add('hidden');
      els.embellishments.textContent = '—';
      state.currentEmbellishments = [];
      return;
    }
    const count = ChordTrainer.chooseRnbEmbellishCount(s);
    const list = ChordTrainer.chooseRnbEmbellishmentsFor(s, state.sessionRootString, chord.type, count);
    state.currentEmbellishments = list;
    if (list && list.length) {
      // Render each embellishment as its own badge
      els.embellishments.innerHTML = '';
      list.forEach((emb) => {
        const span = document.createElement('span');
        span.className = 'embellishment';
        span.textContent = emb;
        els.embellishments.appendChild(span);
      });
      els.embellishmentsWrap.classList.remove('hidden');
    } else {
      els.embellishments.textContent = '—';
      els.embellishmentsWrap.classList.add('hidden');
    }
  }

  function startTimer(seconds) {
    stopAllTimers();
    const sec = Math.max(1, Number(seconds) || 1);
    state.durationSec = sec;
    state.startMs = performance.now();
    state.paused = false;
    state.running = true;
    els.pauseBtn.textContent = 'Pause';
    els.bar.style.width = '0%';
    dlog('startTimer', { sec });
    tick();
  }

  function tick() {
    if (!state.running || state.paused) return;
    const now = performance.now();
    const elapsed = (now - state.startMs) / 1000;
    const remaining = Math.max(0, state.durationSec - elapsed);

    els.timer.textContent = String(Math.ceil(remaining));
    const pct = Math.min(100, Math.max(0, (elapsed / state.durationSec) * 100));
    els.bar.style.width = pct + '%';

    if (remaining <= 0.0001) {
      // Next question
      state.currentQ += 1;
      if (state.currentQ > state.qTotal) {
        finishSet();
      } else {
        nextChord();
      }
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function pauseResume() {
    if (!state.running) return;
    if (!state.paused) {
      const now = performance.now();
      const elapsed = (now - state.startMs) / 1000;
      state.remainingSec = Math.max(0, state.durationSec - elapsed);
      state.paused = true;
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
      dlog('paused', { remainingSec: state.remainingSec });
      els.pauseBtn.textContent = 'Resume';
    } else {
      // resume
      state.startMs = performance.now() - (state.durationSec - state.remainingSec) * 1000;
      state.paused = false;
      dlog('resumed');
      els.pauseBtn.textContent = 'Pause';
      tick();
    }
  }

  function finishSet() {
    state.running = false;
    state.paused = false;
    stopAllTimers();
    dlog('finishSet');
    els.timer.textContent = '0';
    els.bar.style.width = '100%';
    els.endOverlay.style.display = 'flex';
    els.pauseBtn.disabled = true;
  }

  function nextChord() {
    if (!validateAndMaybeWarn()) {
      // Cannot proceed until settings fixed
      state.running = false;
      els.pauseBtn.disabled = true;
      stopAllTimers();
      dlog('blocked: invalid settings during nextChord');
      return;
    }

    updateTopStatus();

    // First chord: IM (triad) normally; IM7 in R&B mode
    let chord;
    if (state.currentQ === 1) {
      chord = { degree: 'I', type: state.settings.rnbMode ? 'M7' : 'M' };
    } else {
      chord = ChordTrainer.drawChord(state.settings);
    }
    if (!chord) {
      setMsg('error', 'No possible chords given current selections. Adjust settings.');
      state.running = false;
      els.pauseBtn.disabled = true;
      stopAllTimers();
      dlog('blocked: no chord available');
      return;
    }

    const style = state.sessionBarreStyle;
    state.currentChord = chord;
    showChordOnUI(chord, style);
    updateEmbellishmentsUI();

    const dur = ChordTrainer.chooseDuration(state.settings);
    dlog('nextChord', { q: state.currentQ, chord, dur });
    startTimer(dur);
  }

  function prepareSetParameters() {
    // Choose root string and root note for this upcoming set
    const chosenRootString = ChordTrainer.chooseRootStringForSet(state.settings);
    const chosenRootNote = ChordTrainer.chooseRootNote12();
    // Always choose an E-barre style for the set regardless of root string
    const chosenBarre = ChordTrainer.chooseEBarreStyle(state.settings);

    // Preview values
    els.preRootString.textContent = chosenRootString === 'E' ? 'Low E' : 'A';
    els.preRootNote.textContent = chosenRootNote;
    // Always show E-barre style preview
    els.preBarreStyle.textContent = chosenBarre || '—';
    els.preBarreStyleWrap.classList.remove('hidden');

    return { chosenRootString, chosenRootNote, chosenBarre };
  }

  function refreshPreStart() {
    const prepared = prepareSetParameters();
    els.startSetBtn.onclick = () => startSet(prepared);
    return prepared;
  }

  function startSet(prepared) {
    // Ensure no lingering timers/intervals from any previous run
    stopAllTimers();
    // Lock parameters for this set
    state.sessionRootString = prepared.chosenRootString;
    state.sessionRootNote = prepared.chosenRootNote;
    state.sessionBarreStyle = prepared.chosenBarre;

    state.qTotal = Math.max(1, Math.floor(state.settings.count));
    state.currentQ = 1;
    els.endOverlay.style.display = 'none';
    els.pauseBtn.disabled = true; // disabled during count-in
    els.preStartPanel.classList.add('hidden');
    updateTopStatus();
    dlog('startSet', { rootStr: state.sessionRootString, rootNote: state.sessionRootNote, barre: state.sessionBarreStyle, qTotal: state.qTotal });

    // 3-2-1 count-in
    let ci = 3;
    els.currentChord.textContent = '—';
    els.bar.style.width = '0%';
    els.timer.textContent = String(ci);
    // Hide embellishments during count-in
    state.currentChord = null;
    state.currentEmbellishments = [];
    if (els.embellishmentsWrap) {
      els.embellishmentsWrap.classList.add('hidden');
      els.embellishments.textContent = '—';
    }
    dlog('countIn:start');
    state.countInId = setInterval(() => {
      ci -= 1;
      if (ci <= 0) {
        clearInterval(state.countInId);
        state.countInId = 0;
        els.pauseBtn.disabled = false;
        dlog('countIn:go');
        nextChord();
      } else {
        els.timer.textContent = String(ci);
      }
    }, 1000);
  }

  function init() {
    // Load settings stored from index page
    state.settings = ChordTrainer.loadSettings();

    // Mirror settings into the in-game panel and lock root string
    applySettingsUI();
    syncSettingsEvents();

    // Handlers
    els.toggleSettings?.addEventListener('click', () => {
      els.settingsPanel.classList.toggle('hidden');
    });

    els.pauseBtn?.addEventListener('click', pauseResume);

    function doRestart() {
      stopAllTimers();
      state.running = false;
      state.paused = false;
      dlog('restart');
      // Clear current chord and embellishments
      state.currentChord = null;
      state.currentEmbellishments = [];
      if (els.embellishmentsWrap) {
        els.embellishmentsWrap.classList.add('hidden');
        els.embellishments.textContent = '—';
      }
      // Prepare a fresh set with possibly updated settings
      const prepared = refreshPreStart();
      els.preStartPanel.classList.remove('hidden');
      // User must press Start to begin
      els.pauseBtn.disabled = true;
      setMsg('success', 'Review set parameters then press Start.');
      // start button bound by refreshPreStart
    }

    els.restartBtn?.addEventListener('click', doRestart);
    els.overlayRestart?.addEventListener('click', doRestart);

    // Always show pre-start parameters when arriving on the game page
    const prepared = refreshPreStart();
    els.preStartPanel.classList.remove('hidden');
    els.pauseBtn.disabled = true;
    setMsg('success', 'Review set parameters then press Start.');
    // start button bound by refreshPreStart
  }

  document.addEventListener('DOMContentLoaded', init);
})();
