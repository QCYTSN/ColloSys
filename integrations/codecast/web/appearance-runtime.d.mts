export type AppearanceMode = 'light' | 'dark' | 'system';
export type AppearanceAccent = 'forest' | 'iris' | 'clay' | 'moss' | 'blue';
export const designTokens: { color: Record<'light' | 'dark', Record<string, string>> };
export interface ProductAppearance {
  version: 1;
  mode: AppearanceMode;
  accent: AppearanceAccent;
}
export function readAppearance(storage?: Pick<Storage, 'getItem' | 'setItem'>): ProductAppearance;
export function applyAppearance(
  preference: ProductAppearance,
  themes: Record<'light' | 'dark', Record<string, string>>,
  forcedMode?: 'light' | 'dark',
  design?: typeof designTokens,
): 'light' | 'dark';
