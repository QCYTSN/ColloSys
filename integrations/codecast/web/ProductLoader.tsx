import { useEffect, useState } from 'react';
import { Logo } from './ProductLogo';

export function AppLoader({
  className = '',
  label = 'Opening your workspace',
  size,
  deferIndicator,
}: {
  className?: string;
  label?: string;
  size?: number;
  deferIndicator?: boolean;
}) {
  const embedded = !!className;
  const [phase] = useState(() => `${-(performance.now() % 1800)}ms`);
  return (
    <div
      className={`collo-loading ${embedded ? 'collo-loading-panel' : 'collo-loading-screen'} ${className}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {!embedded && (
        <header className="collo-loading-top">
          <Logo />
        </header>
      )}
      <div className="collo-loading-frame">
        {!embedded && (
          <aside className="collo-loading-nav" aria-hidden="true">
            <i />
            <i />
            <i />
          </aside>
        )}
        <div className="collo-loading-page">
          <div className="collo-loading-caption">
            <span className="collo-loading-dot" style={{ animationDelay: phase }} />
            {label}
          </div>
          <div className="collo-loading-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      {!embedded && <SlowBootNote />}
    </div>
  );
}
export function SlowBootNote() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return slow ? (
    <div className="collo-slow-boot" role="status">
      <p>This is taking longer than usual.</p>
      <button onClick={() => window.location.reload()}>Retry loading</button>
      <a
        href={`/login?recover=1&return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`}
      >
        Sign-in recovery
      </a>
    </div>
  ) : null;
}
