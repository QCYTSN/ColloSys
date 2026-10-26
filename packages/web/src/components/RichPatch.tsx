import { Component, useMemo, useState, type ReactNode } from 'react';
import type { FileChange } from '../../../shared/src/protocol';
import { Patch } from './Patch';
import { parsePatch } from './codecast/patchParser';
import { useDiffRenderer } from './codecast/pierre';
class DiffBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function RichPatch({ file, dark }: { file: FileChange; dark: boolean }) {
  const [split, setSplit] = useState(false),
    [wrap, setWrap] = useState(false);
  const model = useMemo(() => ({ hunks: parsePatch(file.patch).hunks }), [file.patch]);
  const renderer = useDiffRenderer(file.path);
  if (file.truncated || file.binary || file.status === 'excluded' || !model.hunks.length)
    return <Patch file={file} />;
  return (
    <div className="rich-patch" aria-label={`${file.path} 的代码差异`}>
      <div className="diff-options">
        <label>
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          并排对比
        </label>
        <label>
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
          自动换行
        </label>
      </div>
      <DiffBoundary
        key={file.path + file.afterHash}
        fallback={
          <>
            <p role="status">增强差异视图不可用，显示原始差异。</p>
            <Patch file={file} />
          </>
        }
      >
        {renderer ? (
          <renderer.PierreDiff
            model={model}
            name={file.path}
            lang={renderer.lang}
            theme={dark ? 'dark' : 'light'}
            expandUnchanged={false}
            wrap={wrap}
            split={split}
            showLineNumbers
            lineAnnotations={[]}
            renderAnnotation={() => null}
          />
        ) : (
          <Patch file={file} />
        )}
      </DiffBoundary>
    </div>
  );
}
