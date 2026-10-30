import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { SegmentedToggle } from '../components/SegmentedToggle';

/** Keep both mature readers at the same React/DOM positions across size changes.
 * Only their visibility and panel geometry change; drafts and anchors survive. */
export function ProductReadingSplit({
  open,
  layout,
  onLayoutChange,
  groupRef,
  reading,
  code,
}: {
  open: boolean;
  layout: Record<string, number>;
  onLayoutChange: (layout: Record<string, number>) => void;
  groupRef: RefObject<HTMLDivElement | null>;
  reading: ReactNode;
  code: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0),
    [view, setView] = useState('reading');
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // 420 reading + 600 code + 40 timeline + 4 separator.
  const compact = width < 1064,
    split = open && !compact;
  const mode = !open ? 'reading' : compact ? view : 'split';
  return (
    <div ref={root} className="collo-reading-split" data-mode={mode}>
      {open && compact && (
        <div className="collo-reading-switch" role="group" aria-label="Reading and code">
          <SegmentedToggle
            value={view}
            onChange={setView}
            items={[
              { key: 'reading', label: 'Conversation' },
              { key: 'code', label: 'Files' },
            ]}
          />
        </div>
      )}
      <Group
        orientation="horizontal"
        elementRef={groupRef}
        defaultLayout={layout}
        onLayoutChange={onLayoutChange}
        className="collo-reading-group"
      >
        <Panel id="content-panel" minSize={split ? '420px' : '0%'}>
          <div className="collo-reading-pane" inert={mode === 'code'} aria-hidden={mode === 'code'}>
            {reading}
          </div>
        </Panel>
        <Separator className="cc-split" />
        <Panel id="diff-panel" minSize={split ? '640px' : '0%'}>
          <div
            className="collo-reading-pane"
            inert={mode === 'reading'}
            aria-hidden={mode === 'reading'}
          >
            {open ? code : null}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
