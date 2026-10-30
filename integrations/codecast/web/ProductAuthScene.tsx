import { memo, useEffect, useRef, useState } from 'react';

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
  const [paused, setPaused] = useState(document.hidden),
    [failed, setFailed] = useState(false);
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
      <div className="collo-fold-attention">
        <div className="collo-fold-breath">
          {failed ? (
            <svg className="collo-fold-art" viewBox="0 0 600 720" fill="none">
              <path
                d="M80 650 220 72 510 389 524 644 377 650 347 448 277 246 232 648Z"
                fill="#c86140"
              />
              <path d="m220 72 57 174 70 202 163-59L220 72Z" fill="#ecb38d" />
              <path d="m347 448 30 202 147-6-14-255-163 59Z" fill="#9e432e" />
            </svg>
          ) : (
            <img
              className="collo-fold-art"
              src="/collo-auth/fold.webp"
              width="1152"
              height="1408"
              alt=""
              draggable={false}
              decoding="async"
              fetchPriority="high"
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </div>
      <div className="collo-fold-signal">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
});
