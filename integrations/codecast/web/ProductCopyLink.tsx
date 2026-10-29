import { useState } from 'react';
import { Check, LinkSimple, WarningCircle } from '@phosphor-icons/react';
export function ProductCopyLink() {
  const [state, setState] = useState<'idle' | 'pending' | 'copied' | 'failed'>('idle');
  return (
    <div className="collo-share-copy">
      <button
        type="button"
        className="share-copy"
        disabled={state === 'pending'}
        onClick={async () => {
          setState('pending');
          try {
            await navigator.clipboard.writeText(window.location.href.split('#')[0]);
            setState('copied');
          } catch {
            setState('failed');
          }
        }}
      >
        {state === 'copied' ? (
          <Check size={15} />
        ) : state === 'failed' ? (
          <WarningCircle size={15} />
        ) : (
          <LinkSimple size={15} />
        )}
        {state === 'copied' ? 'Copied' : state === 'pending' ? 'Copying…' : 'Copy link'}
      </button>
      {state === 'failed' && (
        <label role="alert">
          Copy failed. Select the link to copy it manually.
          <input
            readOnly
            value={window.location.href.split('#')[0]}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </div>
  );
}
