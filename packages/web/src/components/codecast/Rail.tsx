// Adapted from Codecast (MIT), commit 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8.
// Copyright (c) 2025 Codecast. See THIRD_PARTY_NOTICES.md and third_party/codecast/LICENSE.
import type React from 'react';
/** A group label in the rail. Hidden when the rail is narrow, where the icons
 *  stand on their own and a heading would just be a stripe of unreadable text. */
export function RailHeading({
  label,
  isNarrow,
  action,
}: {
  label: string;
  isNarrow: boolean;
  action?: React.ReactNode;
}) {
  if (isNarrow) return null;
  return (
    <div
      data-rail-heading={label}
      className="group/rail flex items-center text-xs font-medium text-sol-text-dim uppercase tracking-wide px-4 mb-2 mt-4 first:mt-0"
    >
      <span className="flex-1">{label}</span>
      {/* An action that belongs to the whole group, revealed on hover the
          way a section row reveals its own. */}
      {action}
    </div>
  );
}

/** One nested row shape for every rail list: what it's called, what opening it
 *  does, and its hover actions. NavSection's children and the pinned rail render
 *  through the same component so selection, hover, and action affordances can
 *  never drift apart. */
export type SectionRowSpec = {
  id: string;
  name: string;
  icon?: React.ReactNode;
  /** Highlighted as the row you are currently looking at. */
  active?: boolean;
  /** Rendered at the row's end — a shared marker, an owner avatar. Markers
   *  are information, so they step aside for the hover actions. */
  trailing?: React.ReactNode;
  /** An interactive control at the row's end — the join button of a live
   *  huddle. It stays put while the row is hovered, because a control the
   *  pointer erases on its way to it can never be clicked. */
  control?: React.ReactNode;
  /** A suggestion rather than a live object — rendered quieter until hover. */
  dim?: boolean;
  /** Hover text when it should say more than the name ("Message Sam"). */
  title?: string;
  /** Hover actions, in order. Each is its own small button. */
  actions?: Array<{
    key: string;
    title: string;
    icon: React.ReactNode;
    onClick: (e?: React.MouseEvent) => void;
  }>;
  onSelect: () => void;
  /** Right-click, for rows that have a context menu. */
  onContextMenu?: (e: React.MouseEvent) => void;
};

export function SectionRow({ row, className }: { row: SectionRowSpec; className?: string }) {
  return (
    <div
      onContextMenu={row.onContextMenu}
      className={`flex items-center group/v transition-colors ${
        row.active
          ? 'bg-sol-bg-highlight text-sol-text'
          : 'text-sol-text-muted hover:bg-sol-bg-highlight/40'
      } ${row.dim ? 'opacity-60 hover:opacity-100' : ''} ${className ?? ''}`}
    >
      <button
        onClick={() => {
          row.onSelect();
        }}
        data-nav-subrow
        className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 hover:text-sol-text transition-colors flex-1 min-w-0 text-left"
        title={row.title ?? row.name}
        aria-current={row.active ? 'page' : undefined}
      >
        {row.icon}
        <span className={`truncate text-[13px] min-w-0 ${row.active ? 'text-sol-text' : ''}`}>
          {row.name}
        </span>
      </button>
      {/* A control is the point of the row it sits on, so it survives the
          hover swap below and shares the width with the actions. */}
      {row.control && <span className="flex flex-shrink-0">{row.control}</span>}
      {/* Marker and actions trade places on hover rather than competing for the
          row's width — otherwise the name of the row you are pointing at is the
          first thing to truncate. */}
      {row.trailing && (
        <span className={row.actions?.length ? 'flex group-hover/v:hidden' : 'flex'}>
          {row.trailing}
        </span>
      )}
      {!!row.actions?.length && (
        <span className="hidden group-hover/v:flex items-center flex-shrink-0">
          {row.actions.map((action) => (
            <button
              key={action.key}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(e);
              }}
              className="p-1 rounded text-sol-text-dim hover:text-sol-text flex-shrink-0"
              title={action.title}
            >
              {action.icon}
            </button>
          ))}
        </span>
      )}
      <span className="w-1.5 flex-shrink-0" />
    </div>
  );
}

/** A numeric count on a nav row. Every count in the rail renders through this
 *  so simple view restyles counts by the `data-sv-count` marker, never by
 *  colour: a colour-keyed selector cannot tell a count pill from a project dot
 *  that happens to share its hue. `small` is the pinned rail's scale.
 *  `kind: "mention"` is a chat mention: it stays red in every visual style,
 *  because that number is "someone named you", not a volume count. */
export function NavCount({
  n,
  tone,
  small,
  kind,
}: {
  n: number;
  tone: string;
  small?: boolean;
  kind?: 'mention';
}) {
  return (
    <span
      data-sv-count={kind ?? ''}
      className={`${small ? 'min-w-[16px] h-[15px] px-1 text-[9.5px]' : '-ml-0.5 min-w-[20px] h-[20px] px-1.5 text-[11px]'} flex items-center justify-center font-bold rounded-full flex-shrink-0 ${tone}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}
