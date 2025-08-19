// Guitar Chord Trainer - Common utilities
(function () {
  const STORAGE_KEY = 'gct.settings.v1';

  const DEFAULT_SETTINGS = {
    chordTypes: ['M', 'm', 'M7', 'm7', '7'],
    degrees: ['I', 'II', 'III', 'IV', 'V', 'VI'],
    rootStrings: ['E', 'A'], // multi-select of 'E' and/or 'A'
    eBarreStyles: ['Flat', 'Overhand'],
    count: 12,
    duration: { from: 4, to: 8 },
    diatonicOnly: false,
  };

  const DIATONIC_RULES = {
    I: ['M', 'M7'],
    II: ['m', 'm7'],
    III: ['m', 'm7'],
    IV: ['M', 'M7'],
    V: ['M', '7'],
    VI: ['m', 'm7'],
  };

  const ALLOWED_CHORD_TYPES = ['M', 'm', 'M7', 'm7', '7'];
  const ALLOWED_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const ALLOWED_E_BARRE_STYLES = ['Flat', 'Overhand'];
  const ALLOWED_ROOT_STRINGS = ['E', 'A'];
  const TWELVE_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  function cloneSettings(s) {
    return {
      chordTypes: [...(s.chordTypes || [])],
      degrees: [...(s.degrees || [])],
      rootStrings: [...(s.rootStrings || [])],
      eBarreStyles: [...(s.eBarreStyles || [])],
      count: Number.isFinite(s.count) ? s.count : DEFAULT_SETTINGS.count,
      duration: {
        from: Number.isFinite(s?.duration?.from) ? s.duration.from : DEFAULT_SETTINGS.duration.from,
        to: Number.isFinite(s?.duration?.to) ? s.duration.to : DEFAULT_SETTINGS.duration.to,
      },
      diatonicOnly: !!s.diatonicOnly,
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneSettings(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      return normalizeSettings(parsed);
    } catch (e) {
      console.warn('Failed to load settings, using defaults', e);
      return cloneSettings(DEFAULT_SETTINGS);
    }
  }

  function saveSettings(s) {
    try {
      const normalized = normalizeSettings(s);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  }

  function normalizeSettings(s) {
    const out = cloneSettings(s || {});
    // sanitize values
    out.chordTypes = out.chordTypes.filter((t) => ALLOWED_CHORD_TYPES.includes(t));
    if (out.chordTypes.length === 0) out.chordTypes = [...DEFAULT_SETTINGS.chordTypes];

    out.degrees = out.degrees.filter((d) => ALLOWED_DEGREES.includes(d));
    if (out.degrees.length === 0) out.degrees = [...DEFAULT_SETTINGS.degrees];

    // backward-compat: convert single rootString -> array
    if (typeof s?.rootString === 'string') {
      out.rootStrings = [s.rootString];
    }
    out.rootStrings = (out.rootStrings || []).filter((r) => ALLOWED_ROOT_STRINGS.includes(r));
    if (out.rootStrings.length === 0) out.rootStrings = [...DEFAULT_SETTINGS.rootStrings];

    out.eBarreStyles = out.eBarreStyles.filter((s) => ALLOWED_E_BARRE_STYLES.includes(s));
    if (out.eBarreStyles.length === 0)
      out.eBarreStyles = [...DEFAULT_SETTINGS.eBarreStyles];

    out.count = Math.max(1, Math.floor(out.count || DEFAULT_SETTINGS.count));

    const from = Math.max(1, Math.floor(out.duration.from || DEFAULT_SETTINGS.duration.from));
    const to = Math.max(from, Math.floor(out.duration.to || DEFAULT_SETTINGS.duration.to));
    out.duration = { from, to };

    out.diatonicOnly = !!out.diatonicOnly;

    return out;
  }

  function validateSettings(s) {
    const errors = [];
    if (!s.chordTypes?.length) errors.push('Select at least one chord type.');
    if (!s.degrees?.length) errors.push('Select at least one scale degree.');
    if (!Array.isArray(s.rootStrings) || s.rootStrings.length === 0) errors.push('Choose at least one root note string.');
    if (!s.eBarreStyles || s.eBarreStyles.length === 0) {
      errors.push('Select at least one Low E barre chord style.');
    }
    if (!Number.isFinite(s.count) || s.count < 1) errors.push('Number of questions must be at least 1.');
    if (!Number.isFinite(s.duration?.from) || !Number.isFinite(s.duration?.to)) errors.push('Provide a valid duration range.');
    if (s.duration?.from < 1) errors.push('Minimum duration must be >= 1 second.');
    if (s.duration?.to < s.duration?.from) errors.push('Maximum duration must be >= minimum duration.');

    // If diatonic only, ensure there is at least one valid intersection
    const pool = deriveChordPool(s);
    if (pool.length === 0) {
      errors.push('No possible chords given current selections. Adjust Chord Types, Degrees, or Diatonic Only.');
    }

    return errors;
  }

  function applySettingsToDOM(root, s) {
    const scope = root || document;
    // chord types
    setChecks(scope, 'input[name="chordTypes"]', s.chordTypes);
    // degrees
    setChecks(scope, 'input[name="degrees"]', s.degrees);
    // root strings
    setChecks(scope, 'input[name="rootStrings"]', s.rootStrings);
    // e barre styles
    setChecks(scope, 'input[name="eBarreStyles"]', s.eBarreStyles);
    // numbers
    const countEl = scope.querySelector('#count'); if (countEl) countEl.value = s.count;
    const fromEl = scope.querySelector('#durFrom'); if (fromEl) fromEl.value = s.duration.from;
    const toEl = scope.querySelector('#durTo'); if (toEl) toEl.value = s.duration.to;
    // diatonic
    const diaEl = scope.querySelector('#diatonicOnly'); if (diaEl) diaEl.checked = !!s.diatonicOnly;
  }

  function collectSettingsFromDOM(root) {
    const scope = root || document;
    const chordTypes = getCheckedValues(scope, 'input[name="chordTypes"]');
    const degrees = getCheckedValues(scope, 'input[name="degrees"]');
    const rootStrings = getCheckedValues(scope, 'input[name="rootStrings"]');
    const eBarreStyles = getCheckedValues(scope, 'input[name="eBarreStyles"]');
    const count = parseInt((scope.querySelector('#count') || {}).value, 10);
    const from = parseInt((scope.querySelector('#durFrom') || {}).value, 10);
    const to = parseInt((scope.querySelector('#durTo') || {}).value, 10);
    const diatonicOnly = !!(scope.querySelector('#diatonicOnly') || { checked: false }).checked;

    return normalizeSettings({
      chordTypes,
      degrees,
      rootStrings,
      eBarreStyles,
      count: Number.isFinite(count) ? count : DEFAULT_SETTINGS.count,
      duration: { from: Number.isFinite(from) ? from : DEFAULT_SETTINGS.duration.from, to: Number.isFinite(to) ? to : DEFAULT_SETTINGS.duration.to },
      diatonicOnly,
    });
  }

  function setChecks(scope, selector, values) {
    const set = new Set(values || []);
    scope.querySelectorAll(selector).forEach((el) => {
      el.checked = set.has(el.value);
    });
  }

  function setRadio(scope, selector, value) {
    scope.querySelectorAll(selector).forEach((el) => {
      el.checked = el.value === value;
    });
  }

  function getCheckedValues(scope, selector) {
    const out = [];
    scope.querySelectorAll(selector).forEach((el) => {
      if (el.checked) out.push(el.value);
    });
    return out;
  }

  function getRadioValue(scope, selector) {
    let val = undefined;
    scope.querySelectorAll(selector).forEach((el) => {
      if (el.checked) val = el.value;
    });
    return val;
  }

  function deriveChordPool(s) {
    const pool = [];
    const types = new Set(s.chordTypes);
    for (const degree of s.degrees) {
      const allowed = s.diatonicOnly ? DIATONIC_RULES[degree] || [] : ALLOWED_CHORD_TYPES;
      for (const t of allowed) {
        if (types.has(t)) pool.push({ degree, type: t });
      }
    }
    return pool;
  }

  function randomInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function chooseDuration(s) {
    return randomInt(s.duration.from, s.duration.to);
  }

  function drawChord(s) {
    const pool = deriveChordPool(s);
    if (pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  }

  function chooseBarreStyleForRoot(s, rootString) {
    if (rootString !== 'E') return null;
    if (!s.eBarreStyles?.length) return null;
    const idx = Math.floor(Math.random() * s.eBarreStyles.length);
    return s.eBarreStyles[idx];
  }

  function chooseEBarreStyle(s) {
    if (!s.eBarreStyles?.length) return DEFAULT_SETTINGS.eBarreStyles[0];
    const idx = Math.floor(Math.random() * s.eBarreStyles.length);
    return s.eBarreStyles[idx];
  }

  function chooseRootStringForSet(s) {
    const options = (s.rootStrings && s.rootStrings.length) ? s.rootStrings : DEFAULT_SETTINGS.rootStrings;
    const idx = Math.floor(Math.random() * options.length);
    return options[idx];
  }

  function chooseRootNote12() {
    const idx = Math.floor(Math.random() * TWELVE_NOTES.length);
    return TWELVE_NOTES[idx];
  }

  function romanFor(degree, type) {
    const isMinor = type === 'm' || type === 'm7';
    return isMinor ? degree.toLowerCase() : degree;
  }

  function formatChordLabel({ degree, type }) {
    // Show roman numerals; hide M/m for triads; keep suffix for 7 chords (M7, m7, 7)
    const roman = romanFor(degree, type);
    if (type === 'M' || type === 'm') return roman;
    return `${roman}${type}`;
  }

  function syncUIEvents(root, onChange) {
    const scope = root || document;
    scope.addEventListener('change', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      // Only respond for our inputs
      if (target.matches('input,select')) {
        const s = collectSettingsFromDOM(scope);
        onChange && onChange(s);
      }
    });
  }

  window.ChordTrainer = {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    validateSettings,
    normalizeSettings,
    applySettingsToDOM,
    collectSettingsFromDOM,
    deriveChordPool,
    randomInt,
    chooseDuration,
    drawChord,
    chooseBarreStyleForRoot,
    chooseEBarreStyle,
    chooseRootStringForSet,
    chooseRootNote12,
    formatChordLabel,
    syncUIEvents,
  };
})();
