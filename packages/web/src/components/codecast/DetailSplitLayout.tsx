// Adapted from Codecast DetailSplitLayout.tsx (MIT), commit
// 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8. Copyright (c) 2025 Codecast.
// Preserve mounted list and editable/modal Escape ownership. ColloSys adds a
// resizable desktop split; upstream uses a full-stage overlay and a separate stage system.
import { useEffect, type ReactNode } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
function saved(): Layout | undefined {
  try {
    const value = JSON.parse(localStorage.getItem('collosys.split') ?? 'null');
    if (value && value.list >= 20 && value.list <= 60 && value.detail === 100 - value.list)
      return value;
  } catch {}
}
export function DetailSplitLayout({
  list,
  children,
  open,
  onClose,
}: {
  list: ReactNode;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"]'))
        return;
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);
  return (
    <Group
      className={`workbench-split ${open ? 'detail-open' : ''}`}
      defaultLayout={saved()}
      onLayoutChange={(value) => {
        try {
          localStorage.setItem('collosys.split', JSON.stringify(value));
        } catch {}
      }}
    >
      <Panel
        id="list"
        className="workbench-list-panel"
        defaultSize="34%"
        minSize="20%"
        maxSize="60%"
      >
        {list}
      </Panel>
      <Separator className="workbench-separator" aria-label="调整活动列表宽度" />
      <Panel id="detail" className="workbench-detail-panel" minSize="40%">
        {children}
      </Panel>
    </Group>
  );
}
