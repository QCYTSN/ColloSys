import type { ModTheme } from '@codecast/shared/contracts/theme';
import { designTokens } from './appearance-runtime.mjs';
function foundation(mode: 'light' | 'dark') {
  const p = designTokens.color[mode];
  return {
    bg: p['surface-content'],
    'bg-alt': p['surface-app'],
    card: p['surface-floating'],
    border: p['border-divider'],
    text: p['text-primary'],
    'text-muted': p['text-secondary'],
    'text-dim': p['text-tertiary'],
    link: p.accent,
    violet: p.accent,
    cyan: p.accent,
    red: p.danger,
    green: p.success,
    amber: p.warning,
    yellow: p.warning,
    // Distinct content/status colors remain available to the original engine.
    orange: mode === 'light' ? '#b86b3f' : '#e9a77d',
    blue: mode === 'light' ? '#4c68b0' : '#9eafea',
    magenta: mode === 'light' ? '#ad6083' : '#dca5bf',
    'font-ui': '"Google Sans", "Noto Sans SC", "Microsoft YaHei UI", sans-serif',
    'font-mono': '"Cascadia Code", Consolas, "Noto Sans SC", monospace',
  };
}
export const productTheme: ModTheme = {
  id: 'collosys',
  title: 'ColloSys',
  light: foundation('light'),
  dark: foundation('dark'),
};
