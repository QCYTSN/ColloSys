// Geometry is checked before truncation. Ellipsis never excuses a clipped control.
export async function inspectOverflow(page, rootSelector = 'body') {
  return page
    .locator(rootSelector)
    .first()
    .evaluate((root) => {
      const faults = [],
        legal = [],
        seen = new WeakMap();
      const describe = (el) => ({
        tag: el.tagName,
        id: el.id,
        cls: String(el.className).slice(0, 150),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 100),
      });
      const report = (el, reason, extra = {}) => {
        const prior = seen.get(el) || new Set();
        if (prior.has(reason)) return;
        prior.add(reason);
        seen.set(el, prior);
        faults.push({ ...describe(el), reason, ...extra });
      };
      const code = (el) =>
        !!el.closest('pre,code,[data-diff-code],[data-diff-file],.cm-editor,.monaco-editor');
      const visible = (el) => {
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.bottom > 0 &&
          r.top < innerHeight &&
          s.visibility !== 'hidden' &&
          s.display !== 'none' &&
          !el.closest('[inert],[aria-hidden=true],.sr-only')
        );
      };
      const controls = new Set(root.querySelectorAll('button,input,select,textarea,a,[role=tab]'));
      const nodes = new Set(controls),
        texts = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement || n.parentElement.closest('script,style'))
          continue;
        texts.push(n);
        nodes.add(n.parentElement);
      }
      for (const el of nodes) {
        if (!visible(el) || code(el)) continue;
        const r = el.getBoundingClientRect();
        // Scrolling can reveal an item; a hidden ancestor inside the scroller cannot.
        let scrollX = false,
          scrollY = false;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const ps = getComputedStyle(parent),
            pr = parent.getBoundingClientRect();
          const outsideX = r.left < pr.left - 2 || r.right > pr.right + 2;
          const outsideY = r.top < pr.top - 2 || r.bottom > pr.bottom + 2;
          if (/auto|scroll/.test(ps.overflowX) && parent.scrollWidth > parent.clientWidth + 2)
            scrollX = true;
          if (/auto|scroll/.test(ps.overflowY) && parent.scrollHeight > parent.clientHeight + 2)
            scrollY = true;
          if (/hidden|clip/.test(ps.overflowX) && outsideX && !scrollX)
            report(el, 'clipped horizontally by ancestor', { ancestor: describe(parent) });
          if (/hidden|clip/.test(ps.overflowY) && outsideY && !scrollY)
            report(el, 'clipped vertically by ancestor', { ancestor: describe(parent) });
        }
        if ((r.left < -2 || r.right > innerWidth + 2) && !scrollX)
          report(el, 'outside horizontal viewport');
        if (controls.has(el) && (r.top < -2 || r.bottom > innerHeight + 2) && !scrollY)
          report(el, 'action outside vertical viewport without scroll access');
      }
      for (const text of texts) {
        const el = text.parentElement;
        if (!visible(el) || code(el)) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const rects = [...range.getClientRects()];
        if (!rects.length) continue;
        // All text nodes count, including text in spans/divs. Inline fragments use
        // their containing block, not the unconstrained inline clientWidth.
        let block = el;
        while (getComputedStyle(block).display === 'inline' && block.parentElement)
          block = block.parentElement;
        const bounds = block.getBoundingClientRect(),
          style = getComputedStyle(block);
        const escapes = rects.some((r) => r.left < bounds.left - 2 || r.right > bounds.right + 2);
        const truncated = style.textOverflow === 'ellipsis' || Number(style.webkitLineClamp) > 0;
        const cut =
          escapes ||
          block.scrollWidth > block.clientWidth + 2 ||
          (Number(style.webkitLineClamp) > 0 && block.scrollHeight > block.clientHeight + 2);
        if (truncated && cut) {
          const full = (block.textContent || '').trim(),
            provider = block.closest('[title]');
          if (provider?.getAttribute('title')?.includes(full))
            legal.push({
              ...describe(block),
              reason: 'truncated text has an exact full-text title',
              access: provider.getAttribute('title'),
            });
          else report(block, 'truncated text lacks a verified full-text access path');
        } else if (
          escapes &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(block.tagName) &&
          !/auto|scroll/.test(style.overflowX)
        )
          report(el, 'text range escapes its containing surface');
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        faults,
        legal,
      };
    });
}
