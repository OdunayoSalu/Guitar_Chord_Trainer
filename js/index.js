// Guitar Chord Trainer - Settings page logic
(function () {
  function $(sel) { return document.querySelector(sel); }

  function setMsg(type, text) {
    const msg = $('#msg');
    if (!msg) return;
    msg.classList.remove('hidden', 'error', 'success');
    if (!text) { msg.classList.add('hidden'); return; }
    msg.classList.add(type === 'error' ? 'error' : 'success');
    msg.textContent = text;
  }

  function disableEBarreIfNeeded(s) {
    // E-barre styles are always applicable; ensure inputs are enabled so user can choose.
    const fs = document.getElementById('field-eBarreStyles');
    if (!fs) return;
    fs.querySelectorAll('input[name="eBarreStyles"]').forEach((el) => {
      el.disabled = false;
    });
  }

  function onAnyChange() {
    const s = ChordTrainer.collectSettingsFromDOM(document);
    disableEBarreIfNeeded(s);
    const errors = ChordTrainer.validateSettings(s);
    if (errors.length) {
      setMsg('error', errors[0]);
    } else {
      setMsg('', '');
    }
  }

  function init() {
    const settings = ChordTrainer.loadSettings();
    ChordTrainer.applySettingsToDOM(document, settings);
    disableEBarreIfNeeded(settings);

    ChordTrainer.syncUIEvents(document, (s) => {
      // Save live so game picks it up immediately.
      ChordTrainer.saveSettings(s);
      onAnyChange();
    });

    $('#saveBtn')?.addEventListener('click', () => {
      const s = ChordTrainer.collectSettingsFromDOM(document);
      const errors = ChordTrainer.validateSettings(s);
      if (errors.length) return setMsg('error', errors[0]);
      ChordTrainer.saveSettings(s);
      setMsg('success', 'Defaults saved.');
    });

    $('#resetBtn')?.addEventListener('click', () => {
      const def = ChordTrainer.DEFAULT_SETTINGS;
      ChordTrainer.applySettingsToDOM(document, def);
      ChordTrainer.saveSettings(def);
      disableEBarreIfNeeded(def);
      setMsg('success', 'Reset to defaults.');
    });

    $('#startBtn')?.addEventListener('click', () => {
      const s = ChordTrainer.collectSettingsFromDOM(document);
      const errors = ChordTrainer.validateSettings(s);
      if (errors.length) return setMsg('error', errors[0]);
      ChordTrainer.saveSettings(s);
      window.location.href = 'game.html';
    });

    // Initial validation feedback
    onAnyChange();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
