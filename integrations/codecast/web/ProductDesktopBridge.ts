import type { IdentityProvider } from './productAuthPolicy';
export interface ProductDesktopBridge {
  readonly version: 1;
  beginSignIn(request: {
    version: 1;
    attemptId: string;
    provider: IdentityProvider;
    purpose?: 'link';
  }): Promise<void>;
  setAppearance(request: {
    version: 1;
    mode: 'light' | 'dark' | 'system';
    theme: 'light' | 'dark';
    background: string;
  }): Promise<void>;
  call(name: 'chooseDirectory'): Promise<{ path: string | null }>;
  onVisibilityChange?(listener: (visible: boolean) => void): () => void;
}
declare global {
  interface Window {
    __COLLOSYS_DESKTOP__?: ProductDesktopBridge;
  }
}
