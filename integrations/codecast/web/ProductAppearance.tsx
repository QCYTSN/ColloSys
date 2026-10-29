import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { Sun, Moon, Desktop, Check } from '@phosphor-icons/react';
import { themeVarsByMode } from '../lib/theme/themeVars';
import { productTheme } from './productTheme';
import {
  applyAppearance,
  readAppearance,
  type ProductAppearance,
  type AppearanceMode,
  type AppearanceAccent,
} from './appearance-runtime.mjs';
import type {} from './ProductDesktopBridge';

export type Theme = 'dark' | 'light';
export type VisualStyle = 'classic' | 'minimal';
type AppearanceContext = {
  preference: ProductAppearance;
  theme: Theme;
  save: (change: Partial<Pick<ProductAppearance, 'mode' | 'accent'>>) => void;
  error: string;
  toggleTheme: () => void;
  visualStyle: VisualStyle;
  setVisualStyle: (style: VisualStyle) => void;
};
const themes = themeVarsByMode(productTheme);
type FoundationThemeContext = Pick<
  AppearanceContext,
  'theme' | 'toggleTheme' | 'visualStyle' | 'setVisualStyle'
>;
export const ThemeContext = createContext<FoundationThemeContext | undefined>(undefined);
const ProductAppearanceContext = createContext<AppearanceContext | undefined>(undefined);
const ThemeLockContext = createContext<((theme: Theme) => () => void) | null>(null);
export function ProductAppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ProductAppearance>(readAppearance),
    [systemDark, setSystemDark] = useState(
      () => matchMedia('(prefers-color-scheme: dark)').matches,
    ),
    [lock, setLock] = useState<Theme | null>(null),
    [error, setError] = useState('');
  const theme =
    lock ?? (preference.mode === 'system' ? (systemDark ? 'dark' : 'light') : preference.mode);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)'),
      changed = () => setSystemDark(media.matches);
    const storage = (event: StorageEvent) => {
      if (event.key === 'collosys.appearance.v1' || event.key === null)
        setPreference(readAppearance());
    };
    media.addEventListener('change', changed);
    window.addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', changed);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useLayoutEffect(() => {
    applyAppearance(preference, themes, theme);
    document.documentElement.classList.remove('hosted-mode', 'minimal-style', 'codex-style');
    void window.__COLLOSYS_DESKTOP__
      ?.setAppearance({
        version: 1,
        mode: preference.mode,
        theme,
        background: themes[theme]['--sol-bg'],
      })
      .catch(() =>
        setError('The window frame could not update. Reopen this window to apply its appearance.'),
      );
  }, [preference, theme]);
  const save = useCallback((change: Partial<Pick<ProductAppearance, 'mode' | 'accent'>>) => {
    // Read the latest value to avoid clobbering another window's accent/mode.
    const next = { ...readAppearance(), ...change, version: 1 as const };
    try {
      localStorage.setItem('collosys.appearance.v1', JSON.stringify(next));
      setPreference(next);
      setError('');
    } catch {
      setError('This device could not save appearance. Free some browser storage and try again.');
    }
  }, []);
  const acquireLock = useCallback((value: Theme) => {
    setLock(value);
    return () => setLock(null);
  }, []);
  const value: AppearanceContext = {
    preference,
    theme,
    save,
    error,
    toggleTheme: () => save({ mode: theme === 'dark' ? 'light' : 'dark' }),
    visualStyle: 'classic',
    setVisualStyle: () => {},
  };
  return (
    <ThemeLockContext.Provider value={acquireLock}>
      <ProductAppearanceContext.Provider value={value}>
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
      </ProductAppearanceContext.Provider>
    </ThemeLockContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ColloSys appearance provider is missing');
  return value;
}
export function useThemeLock(theme: Theme) {
  const acquire = useContext(ThemeLockContext);
  useEffect(() => acquire?.(theme), [acquire, theme]);
}
export function ProductAppearanceSettings() {
  const appearance = useContext(ProductAppearanceContext);
  if (!appearance) throw new Error('ColloSys appearance settings are outside the product provider');
  const { preference, save, error } = appearance;
  const accents: [AppearanceAccent, string][] = [
    ['iris', 'Iris'],
    ['clay', 'Clay'],
    ['moss', 'Moss'],
    ['blue', 'Lake'],
  ];
  return (
    <section className="collo-appearance-settings">
      <h2>Appearance</h2>
      <p>Choose how ColloSys feels on this device. All its windows stay in sync.</p>
      <div role="group" aria-label="Theme" className="collo-appearance-modes">
        {(
          [
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
            ['system', 'System', Desktop],
          ] as const
        ).map(([mode, title, Icon]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={preference.mode === mode}
            onClick={() => save({ mode: mode as AppearanceMode })}
          >
            <span
              className={`collo-appearance-sample sample-${mode}`}
              aria-hidden="true"
              style={{
                '--preview-bg': themes[mode === 'system' ? appearance.theme : mode]['--sol-bg'],
                '--preview-tool': themes[mode === 'system' ? appearance.theme : mode]['--sol-bg-alt'],
                '--preview-line': themes[mode === 'system' ? appearance.theme : mode]['--sol-border'],
                '--preview-accent': `var(--collo-accent-${preference.accent}-${mode === 'system' ? appearance.theme : mode})`,
              } as CSSProperties}
            >
              <i />
              <span>
                <b />
                <b />
                <b />
              </span>
            </span>
            <span>
              <Icon size={16} />
              {title}
              {preference.mode === mode && <Check size={15} weight="bold" />}
            </span>
          </button>
        ))}
      </div>
      <h3>Accent</h3>
      <div role="group" aria-label="Application accent" className="collo-appearance-accents">
        {accents.map(([accent, name]) => (
          <button
            key={accent}
            type="button"
            aria-pressed={preference.accent === accent}
            onClick={() => save({ accent })}
          >
            <i style={{ '--preview-accent': `var(--collo-accent-${accent})` } as CSSProperties}>
              {preference.accent === accent && <Check size={13} weight="bold" />}
            </i>
            {name}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
