export type AppearanceMode = 'light' | 'dark' | 'system';
export type AppearanceAccent = 'iris' | 'clay' | 'moss' | 'blue';
export interface ProductAppearance { version: 1; mode: AppearanceMode; accent: AppearanceAccent; }
export function readAppearance(storage?: Pick<Storage, 'getItem' | 'setItem'>): ProductAppearance;
export function applyAppearance(preference: ProductAppearance, themes: Record<'light' | 'dark', Record<string, string>>, forcedMode?: 'light' | 'dark'): 'light' | 'dark';
