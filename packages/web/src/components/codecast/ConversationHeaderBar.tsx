// Adapted from Codecast (MIT), commit 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8.
// Copyright (c) 2025 Codecast. See THIRD_PARTY_NOTICES.md and third_party/codecast/LICENSE.
import type { ReactNode, Ref } from 'react';
export function ConversationHeaderTitle({
  text,
  tooltip,
  onDoubleClick,
}: {
  text: ReactNode;
  tooltip?: string;
  onDoubleClick?: () => void;
}) {
  return (
    <h1
      data-cc-conv-title
      className="cc-panel__title truncate flex-1 min-w-0 cursor-default"
      title={tooltip}
      onDoubleClick={onDoubleClick}
    >
      {text}
    </h1>
  );
}

/**
 * The conversation header's frame, as slots. ConversationView fills every slot
 * from the live session; the marketing hero fills a few with fixture views.
 * The squeeze row sheds chip detail by container width (cq-sq* in
 * globals.css), so the order of the slots is the order they give way in.
 */
export function ConversationHeaderBar({
  headerRef,
  headRef,
  squeezeRowRef,
  className = '',
  lead,
  title,
  titlePills,
  status,
  facts,
  actions,
  end,
  strips,
  children,
}: {
  headerRef?: Ref<HTMLElement>;
  headRef?: Ref<HTMLDivElement>;
  squeezeRowRef?: Ref<HTMLDivElement>;
  className?: string;
  /** Before the title: zen exit, the caller's headerLeft, the identity face. */
  lead?: ReactNode;
  title: ReactNode;
  titlePills?: ReactNode;
  /** Usually an AgentStatusPill. */
  status?: ReactNode;
  /** The dim facts strip: agent and model, branch, task, plan, age. */
  facts?: ReactNode;
  /** The right-hand cluster: live pills, then search, share and the menu. */
  actions?: ReactNode;
  end?: ReactNode;
  /** Full-width strips under the title row, inside the measured block. */
  strips?: ReactNode;
  /** Overlays and docked panes that live inside the header element. */
  children?: ReactNode;
}) {
  return (
    <header
      ref={headerRef}
      data-sv-convhead
      className={`cq-container shrink-0 relative ${className}`}
    >
      <div>
        <div ref={headRef} className="cc-panel__head gap-2 min-w-0">
          <div
            ref={squeezeRowRef}
            className="cq-squeeze-row flex items-center gap-2 min-w-0 overflow-hidden flex-1"
          >
            {lead}
            {title}
            {titlePills}
            {status}
            {facts ? (
              <span
                data-cc-facts
                data-cc-conv-meta
                data-simple-dim
                className="cq-sq6 flex items-center min-w-0"
              >
                {facts}
              </span>
            ) : null}
            {actions ? (
              <div
                data-cc-conv-actions
                className="flex items-center gap-1 flex-shrink-0 overflow-hidden ml-auto"
              >
                {actions}
              </div>
            ) : null}
          </div>
          {end && <div className="flex-shrink-0">{end}</div>}
        </div>
        {strips}
      </div>
      {children}
    </header>
  );
}
