import { useEffect, useState } from 'react';
import { Logo } from './ProductLogo';

export interface ProductLoaderProps { className?: string; label?: string; size?: number; deferIndicator?: boolean; }
export function AppLoader({ className = '', label = 'Starting ColloSys' }: ProductLoaderProps) {
  const embedded = !!className;
  return <div className={`collo-loading ${embedded ? 'collo-loading-panel' : 'collo-loading-screen'} ${className}`} role="status" aria-label={label} aria-busy="true">
    <div className="collo-loading-brand">{!embedded && <Logo />}<div className="collo-loading-caption"><span className="collo-loading-dot" />{label}</div>{!embedded && <SlowBootNote />}</div>
  </div>;
}
export function SlowBootNote() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 8000); return () => clearTimeout(timer); }, []);
  return slow ? <div className="collo-slow-boot"><p>This is taking longer than usual.</p><button onClick={() => location.reload()}>Retry loading</button><a href={`/login?recover=1&return_to=${encodeURIComponent(location.pathname + location.search + location.hash)}`}>Sign-in recovery</a></div> : null;
}
