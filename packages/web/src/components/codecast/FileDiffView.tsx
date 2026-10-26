// Adapted from Codecast (MIT), commit 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8.
// Copyright (c) 2025 Codecast. See THIRD_PARTY_NOTICES.md and third_party/codecast/LICENSE.
import { useState, type ReactNode } from 'react';

// One changed file inside a pull request or a commit: the status chip, the
// path, the +/- counts, and the patch behind a click. PRCard, CommitCard and
// the shared-object card all show the same rows, so the row lives once here.

export type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

const STATUS_CHIP: Record<string, string> = {
  added: 'bg-sol-green/20 text-sol-green',
  removed: 'bg-sol-red/20 text-sol-red',
  deleted: 'bg-sol-red/20 text-sol-red',
  modified: 'bg-sol-yellow/20 text-sol-yellow',
  renamed: 'bg-sol-yellow/20 text-sol-yellow',
};

export function FileDiffView({ file, children }: { file: DiffFile; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="file-diff-view">
      <button
        aria-expanded={expanded}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-sol-bg-alt/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_CHIP[file.status] ?? 'bg-sol-blue/20 text-sol-blue'}`}
          >
            {(
              { added: '新增', deleted: '删除', modified: '修改', excluded: '已排除' } as Record<
                string,
                string
              >
            )[file.status] ?? file.status}
          </span>
          <span className="font-mono text-xs text-sol-text-secondary truncate">
            {file.filename}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono flex-shrink-0">
          {file.additions > 0 && <span className="text-sol-green">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-sol-red">-{file.deletions}</span>}
          <svg
            className={`w-3 h-3 text-sol-text-dim transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && <div className="px-1 pb-1">{children}</div>}
    </div>
  );
}
