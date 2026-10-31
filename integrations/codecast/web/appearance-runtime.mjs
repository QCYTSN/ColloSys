import designTokens from './design-tokens.json' with { type: 'json' };
export { designTokens };
// Shared verbatim by the first HTML and React. Preferences are device-scoped.
// Both functions are self-contained so boot can serialize them without a bundle.
export function readAppearance(storage = localStorage) {
  const fallback = { version: 1, mode: 'system', accent: 'forest' };
  try {
    const raw = storage.getItem('collosys.appearance.v1');
    if (raw !== null) {
      const value = JSON.parse(raw);
      return value?.version === 1 &&
        ['light', 'dark', 'system'].includes(value.mode) &&
        ['forest', 'iris', 'clay', 'moss', 'blue'].includes(value.accent)
        ? value
        : fallback;
    }
    const legacy = storage.getItem('codecast-theme');
    const value = {
      ...fallback,
      mode: legacy === 'light' || legacy === 'dark' ? legacy : 'system',
    };
    // Commit the new value before marking migration. Never erase the old
    // preference, and never overwrite a new choice on subsequent starts.
    storage.setItem('collosys.appearance.v1', JSON.stringify(value));
    storage.setItem('collosys.migration.appearance.v1', 'complete');
    return value;
  } catch {
    return fallback;
  }
}
export function applyAppearance(preference, themes, forcedMode, design = designTokens) {
  const mode =
    forcedMode ||
    (preference.mode === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference.mode);
  const root = document.documentElement,
    variables = themes[mode],
    palette = design.color[mode];
  const accents = {
    forest: [design.color.light.accent, design.color.dark.accent],
    iris: ['#7568b6', '#b2a8ee'],
    clay: ['#a86944', '#dfae8e'],
    moss: ['#36775e', '#92c7ae'],
    blue: ['#496caf', '#a3b9ed'],
  };
  const accent = (accents[preference.accent] || accents.forest)[mode === 'dark' ? 1 : 0];
  for (const [name, [light, dark]] of Object.entries(accents)) {
    root.style.setProperty(`--collo-accent-${name}-light`, light);
    root.style.setProperty(`--collo-accent-${name}-dark`, dark);
    root.style.setProperty(`--collo-accent-${name}`, mode === 'dark' ? dark : light);
  }
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
  for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);
  // Product roles are authoritative. Legacy --sol-* values only adapt older
  // components; they can no longer redefine product surfaces or text roles.
  for (const [key, value] of Object.entries(palette))
    root.style.setProperty(`--collo-${key}`, value);
  // Foundation adapter: old shared controls receive the product's accent.
  for (const key of ['--sol-violet', '--sol-cyan', '--sol-link'])
    root.style.setProperty(key, accent);
  // Selected, hover and focus use the same chosen hue. Primary actions and
  // danger/success stay semantic; a retained Iris preference is not half Forest.
  const selection =
    preference.accent === 'forest'
      ? palette['selection-bg']
      : `color-mix(in srgb, ${accent} ${mode === 'dark' ? 19 : 12}%, ${palette['surface-content']})`;
  const tokens = {
    '--collo-accent': accent,
    '--collo-link': accent,
    '--collo-selection-bg': selection,
    '--collo-accent-soft': selection,
    '--collo-selection-ink':
      preference.accent === 'forest' ? palette['selection-ink'] : palette['text-primary'],
  };
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(key, value);
  root.dataset.colloAppearance = `${mode}:${preference.accent}`;
  return mode;
}
