// Adapted from Codecast packages/web/components/tools/MarkdownRenderer.tsx (MIT).
// Commit 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8; Copyright (c) 2025 Codecast.
// Keep memoized blocks and renderer; omit upstream HTML canvas and private object controls.
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  // Reading a shared transcript never loads tracking images or local filesystem URLs.
  img: ({ alt, src }) => (
    <a href={/^https?:\/\//i.test(src ?? '') ? src : undefined} target="_blank" rel="noreferrer">
      [图片：{alt || '打开链接'}]
    </a>
  ),
};
const plugins = [remarkGfm];
export const MarkdownBlocks = memo(function MarkdownBlocks({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
      {content}
    </ReactMarkdown>
  );
});
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <MarkdownBlocks content={content} />
    </div>
  );
});
