import { readFileSync } from 'node:fs';
// Exact edits to the already prepared product patch chain; never edit the pin.
const patch = (file, before, after) => ({ file: `packages/web/${file}`, before, after });
export const craftPatches = [
  patch('app/share/SharedObjectPage.tsx', 'import { Check, Link2, Unlink } from "lucide-react";', 'import { LinkBreak as Unlink } from "@phosphor-icons/react";'),
  {
    file: 'packages/web/app/share/SharedObjectPage.tsx',
    before:
      'function CopyPageLink() {\n  const [copied, setCopied] = useState(false);\n  return (\n    <button\n      type="button"\n      className="share-copy"\n      onClick={() => {\n        void navigator.clipboard?.writeText(window.location.href.split("#")[0]);\n        setCopied(true);\n        setTimeout(() => setCopied(false), 1800);\n      }}\n    >\n      {copied ? <Check size={13} /> : <Link2 size={13} />}\n      {copied ? "Copied" : "Copy link"}\n    </button>\n  );\n}\n\n',
    after: 'import { ProductCopyLink as CopyPageLink } from "../../collo/ProductCopyLink";\n\n',
  },
  {
    file: 'packages/web/app/share/share.css',
    before:
      '.share-page {\n  --ink: var(--sol-text);\n  --ink-soft: var(--sol-text-secondary);\n  --ink-muted: var(--sol-text-muted);\n  --ink-dim: var(--sol-text-dim);\n  --paper: var(--sol-bg);\n  --paper-alt: var(--sol-bg-alt);\n  --rule: color-mix(in srgb, var(--sol-text) 12%, transparent);\n  --accent: #2aa198;\n  --serif: var(--font-serif), Georgia, serif;\n  --mono: var(--font-mono), ui-monospace, monospace;\n  min-height: 100vh;\n  background:\n    radial-gradient(1200px 500px at 85% -10%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%),\n    radial-gradient(900px 400px at -10% 20%, color-mix(in srgb, #b58900 6%, transparent), transparent 55%),\n    var(--paper);\n  color: var(--ink);\n  font-family: var(--mono);\n}\n\n',
    after:
      '.share-page {\n  --ink: var(--collo-ink); --ink-soft: var(--collo-secondary); --ink-muted: var(--collo-secondary); --ink-dim: var(--collo-tertiary);\n  --paper: var(--collo-content); --paper-alt: var(--collo-tool); --rule: var(--collo-line); --accent: var(--collo-accent);\n  --serif: var(--font-ui); --mono: var(--font-ui); min-height: 100vh; background: var(--paper); color: var(--ink); font-family: var(--font-ui);\n}\n.collo-share-copy { margin-left: auto; position: relative; }\n.collo-share-copy label { display: block; max-width: 320px; font-size: 12px; color: var(--collo-danger); }\n.collo-share-copy input { width: 100%; color: var(--collo-ink); border: 1px solid var(--collo-line); padding: 6px; }\n\n',
  },
  {
    file: 'packages/web/app/share/share.css',
    before:
      '  backdrop-filter: blur(10px);\n  background: color-mix(in srgb, var(--paper) 78%, transparent);',
    after: '  background: var(--paper);',
  },
  {
    file: 'packages/web/app/share/share.css',
    before:
      '/* The page arrives in order, a beat apart. */\n.share-col > * {\n  animation: share-rise 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both;\n}\n.share-col > *:nth-child(2) { animation-delay: 60ms; }\n.share-col > *:nth-child(3) { animation-delay: 120ms; }\n.share-col > *:nth-child(4) { animation-delay: 180ms; }\n.share-col > *:nth-child(n + 5) { animation-delay: 240ms; }\n@keyframes share-rise {\n  from { opacity: 0; transform: translateY(10px); }\n}\n@media (prefers-reduced-motion: reduce) {\n  .share-col > *, .share-progress { animation: none; }\n}\n\n',
    after: '/* Readable content arrives together, without per-item delays. */\n\n',
  },
  {
    file: 'packages/web/components/DashboardLayout.tsx',
    before: '                desktopOnly\n              >\n                <PanelLeft />',
    after:
      '                desktopOnly\n                aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}\n              >\n                <PanelLeft />',
  },

  patch(
    'components/ui/tooltip.tsx',
    readFileSync(
      new URL(
        '../../third_party/codecast/upstream/packages/web/components/ui/tooltip.tsx',
        import.meta.url,
      ),
      'utf8',
    ).replaceAll('\r\n', '\n'),
    'export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../../collo/ProductTooltip";\n',
  ),
  patch(
    'components/DetailSplitLayout.tsx',
    'ref={detailRef} tabIndex={-1}',
    'ref={node => { detailRef.current = node; presence.ref(node); }} tabIndex={-1}',
  ),
  patch(
    'components/DetailSplitLayout.tsx',
    'import { useRouter } from "next/navigation";',
    'import { useRouter, usePathname, useSearchParams } from "next/navigation";',
  ),
  patch(
    'components/DetailSplitLayout.tsx',
    '  const origin = useRef<HTMLElement | null>(null);',
    `  const origin = useRef<HTMLElement | null>(null);
  const pathname = usePathname(), params = useSearchParams();
  const presentationKey = [pathname, params.get("event"), params.get("handoff"), params.get("session")].join(":");
  const presented = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!active) { presented.current = null; return; }
    const changed = presented.current !== null && presented.current !== presentationKey;
    presented.current = presentationKey;
    if (!changed || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const heading = detailRef.current?.querySelector('.collo-review-heading, .collo-reader-heading, h1, h2');
    const animation = heading?.animate([{opacity: .65, transform: 'translateY(3px)'}, {opacity: 1, transform: 'none'}], {duration: 140, easing: 'ease-out'});
    return () => animation?.cancel();
  }, [active, presentationKey]);`,
  ),
  patch(
    'components/settings/SettingsModal.tsx',
    'ref={panelRef}',
    'ref={node => { panelRef.current = node; presence.ref(node); }}',
  ),
  patch(
    'lib/browserPane.ts',
    'return thing && thing !== surface ? `Codecast ${surface} | ${thing}` : `Codecast ${surface}`;',
    'return thing && thing !== surface ? `ColloSys ${surface} | ${thing}` : `ColloSys ${surface}`;',
  ),
  patch(
    'app/share/SharedObjectPage.tsx',
    '<a className="share-mark" href="https://codecast.sh">\n          <i aria-hidden />\n          codecast\n        </a>',
    '<a className="share-mark" href="/projects">\n          <img src="/collo-brand/mark-32.png" width="24" height="24" alt="" />\n          ColloSys\n        </a>',
  ),
  patch(
    'app/share/SharedObjectPage.tsx',
    'Shared from <a href="https://codecast.sh">Codecast</a>, where people and their agents work in the open.',
    'Shared from <a href="/projects">ColloSys</a>. Conversations, checkpoints and team context.',
  ),
  patch(
    'components/ui/button.css',
    '  --btn-tint: #2aa198;\n  --btn-ink: #002b36;',
    '  --btn-tint: var(--collo-action);\n  --btn-ink: var(--collo-on-action);\n  color: var(--collo-on-action);',
  ),
  patch(
    'components/ui/button.tsx',
    'cyan: "cc-btn-fill cc-btn-cyan text-sol-base03",',
    'cyan: "cc-btn-fill cc-btn-cyan",',
  ),
  patch(
    'components/timeline/Rail.tsx',
    'className="text-[10px] text-sol-text-dim tabular-nums flex-shrink-0 pt-0.5"',
    'className="text-xs text-sol-text-dim tabular-nums flex-shrink-0 pt-1"',
  ),
  patch(
    'components/DashboardLayout.tsx',
    'import { ProductHeader }',
    'import { transitionProductPanels } from "../collo/productPanelMotion";\nimport { ProductHeader }',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '  const sidebarAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);',
    '  const railAppliedRef = useRef<boolean | null>(null);',
  ),
  patch(
    'components/DashboardLayout.tsx',
    `    sidebarProgrammaticRef.current = true;
    // Freeze content at its current pixel width so text doesn't reflow while the
    // panel width animates (only meaningful when collapsing from a real width).
    const width = el.getBoundingClientRect().width;
    if (width) el.style.setProperty("--sidebar-frozen-w", \`\${width}px\`);
    el.classList.add("sidebar-animating");
    if (sidebarAnimTimer.current) clearTimeout(sidebarAnimTimer.current);
    sidebarAnimTimer.current = setTimeout(() => {
      el.classList.remove("sidebar-animating");
      sidebarProgrammaticRef.current = false;
    }, 360);
    // Expand by resizing to the persisted width (always ≥ minSize) instead of the
    // library's expand(): its restored size can land below the collapse/min
    // midpoint and get clamped straight back to 0, making expand a silent no-op.
    if (sidebarHidden) ref.collapse();
    else ref.resize(\`\${layout.sidebar}%\`);`,
    `    return transitionProductPanels(navGroupElRef.current, () => {
      sidebarProgrammaticRef.current = true;
      if (sidebarHidden) ref.collapse();
      else ref.resize(\`\${layout.sidebar}%\`);
    }, () => { sidebarProgrammaticRef.current = false; });`,
  ),
  patch(
    'components/DashboardLayout.tsx',
    `    if (showSessionList) {
      // Resize (not expand): it both opens a collapsed panel and applies a
      // workbench-restored width; expand() can clamp back to 0 (see the
      // sidebar note above). Skip the echo of our own drag.
      if (ref.isCollapsed() || railDragEchoRef.current !== railSize) {
        railDragEchoRef.current = railSize;
        ref.resize(\`\${railSize}%\`);
      }
    } else {
      if (!ref.isCollapsed()) ref.collapse();
    }`,
    `    const toggle = railAppliedRef.current !== null && railAppliedRef.current !== showSessionList;
    railAppliedRef.current = showSessionList;
    const change = () => {
      if (showSessionList) {
        if (ref.isCollapsed() || railDragEchoRef.current !== railSize) {
          railDragEchoRef.current = railSize;
          ref.resize(\`\${railSize}%\`);
        }
      } else if (!ref.isCollapsed()) ref.collapse();
    };
    if (toggle) return transitionProductPanels(railGroupElRef.current, change);
    change();`,
  ),
];
