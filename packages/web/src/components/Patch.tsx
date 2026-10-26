import { useMemo } from 'react';
import { AlertCircle, FileCode2 } from 'lucide-react';
import type { FileChange } from '../../../shared/src/protocol';
import { parsePatch } from './codecast/patchParser';

export function Patch({ file }: { file: FileChange }) {
  const parsed = useMemo(() => parsePatch(file.patch), [file.patch]);
  if (file.status === 'excluded')
    return (
      <div className="binary-state">
        <AlertCircle size={22} />
        <strong>此文件已不在纳管范围内</strong>
        <p>当前内容未保存，磁盘文件没有被删除。</p>
      </div>
    );
  if (file.binary)
    return (
      <div className="binary-state">
        <FileCode2 size={22} />
        <strong>{file.status === 'deleted' ? '二进制文件已删除' : '二进制文件已捕获'}</strong>
        <p>
          {file.status === 'deleted'
            ? '恢复旧内容需选择删除前的检查点。'
            : '原始字节保存在本地检查点中。'}
        </p>
      </div>
    );
  return (
    <div className="patch-view" aria-label={`${file.path} 的代码差异`}>
      {parsed.hunks.map((hunk, i) => (
        <div className="diff-hunk" key={i}>
          <div className="patch-hunk-header">
            @@ −{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
          </div>
          {hunk.lines.map((line, j) => (
            <div className={`patch-line ${line.type}`} key={j}>
              <span className="line-number">{line.oldLineNumber}</span>
              <span className="line-number">{line.newLineNumber}</span>
              <span className="line-sign" aria-hidden="true">
                {line.type === 'addition' ? '+' : line.type === 'deletion' ? '−' : ' '}
              </span>
              <code>{line.content || ' '}</code>
            </div>
          ))}
        </div>
      ))}
      {!parsed.hunks.length && <div className="patch-empty">没有可显示的文本差异</div>}
      {file.truncated && (
        <div className="truncated-note">差异显示已截断；完整内容保存在本地检查点。</div>
      )}
    </div>
  );
}

export function changeCounts(patch: string) {
  const lines = parsePatch(patch).hunks.flatMap((h) => h.lines);
  return {
    additions: lines.filter((l) => l.type === 'addition').length,
    deletions: lines.filter((l) => l.type === 'deletion').length,
  };
}
