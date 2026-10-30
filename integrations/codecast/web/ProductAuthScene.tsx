import { memo, useEffect, useRef, useState } from 'react';
import waterside from './waterside.svg?raw';

export type AuthSceneState =
  | 'idle'
  | 'input-focused'
  | 'password-focused'
  | 'submitting'
  | 'oauth-starting'
  | 'oauth-waiting'
  | 'success'
  | 'recoverable-error';

/** Display facts only. No identity, credentials, field values or lengths enter
 * this component. Authentication and navigation never await its animation. */
export const ProductAuthScene = memo(function ProductAuthScene({
  state,
}: {
  state: AuthSceneState;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(document.hidden);
  useEffect(() => {
    let intersects = true,
      nativeVisible = true;
    const update = () => setPaused(document.hidden || !intersects || !nativeVisible);
    const unsubscribe = window.__COLLOSYS_DESKTOP__?.onVisibilityChange?.((visible) => {
      nativeVisible = visible;
      update();
    });
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      update();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      unsubscribe?.();
    };
  }, []);
  return (
    <div
      className="collo-companion-scene"
      ref={root}
      data-state={state}
      data-paused={paused}
      aria-hidden="true"
    >
      {/* Authored local SVG, bundled with this lazy auth component. It has no
          network image dependency and remains a static landscape without CSS. */}
      <div className="collo-waterside" dangerouslySetInnerHTML={{ __html: waterside }} />
    </div>
  );
});
