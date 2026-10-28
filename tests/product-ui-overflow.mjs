// Inner geometry, not just document.scrollWidth. Code/tree horizontal scrolling,
// list vertical scrolling and deliberate ellipsis with a full-text action are
// separate from escaped prose or clipped action controls.
export async function inspectOverflow(page, rootSelector = 'body') {
  return page
    .locator(rootSelector)
    .first()
    .evaluate((root) => {
      const faults = [],
        legal = [];
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
          !el.closest('[inert]')
        );
      };
      const describe = (el) => ({
        tag: el.tagName,
        cls: String(el.className).slice(0, 170),
        text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 100),
      });
      const code = (el) =>
        !!el.closest('pre,code,[data-diff-code],[data-diff-file],.cm-editor,.monaco-editor');
      for (const el of root.querySelectorAll(
        'button,input,select,textarea,a,h1,h2,h3,p,label,strong,[role=tab]',
      )) {
        if (!visible(el) || code(el)) continue;
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        const text = (el.textContent || '').trim();
        const intentional =
          s.textOverflow === 'ellipsis' ||
          (s.webkitLineClamp !== 'none' && Number(s.webkitLineClamp) > 0);
        if (intentional) {
          legal.push({
            ...describe(el),
            reason: 'intentional ellipsis; full text in title, accessible name or detail',
          });
          continue;
        }
        if (r.left < -1 || r.right > innerWidth + 1)
          faults.push({
            ...describe(el),
            reason: 'outside viewport',
            left: r.left,
            right: r.right,
          });
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          const ps = getComputedStyle(parent),
            pr = parent.getBoundingClientRect();
          if (
            (ps.overflowX === 'hidden' || ps.overflowX === 'clip') &&
            (r.left < pr.left - 2 || r.right > pr.right + 2)
          ) {
            faults.push({
              ...describe(el),
              reason: 'clipped by ancestor',
              ancestor: describe(parent),
              left: r.left,
              right: r.right,
              clipLeft: pr.left,
              clipRight: pr.right,
            });
            break;
          }
          parent = parent.parentElement;
        }
        if (
          ['BUTTON', 'LABEL', 'P', 'STRONG', 'H1', 'H2', 'H3'].includes(el.tagName) &&
          text &&
          el.scrollWidth > el.clientWidth + 2 &&
          s.display !== 'inline'
        )
          faults.push({
            ...describe(el),
            reason: 'internal content wider than control or prose',
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          });
        // Check text ranges in leaf prose: visible overflow can escape even when
        // the element's own bounding rectangle looks correct.
        if (
          ['P', 'STRONG', 'H1', 'H2', 'H3'].includes(el.tagName) &&
          el.childElementCount === 0 &&
          text
        ) {
          const range = document.createRange();
          range.selectNodeContents(el);
          if ([...range.getClientRects()].some((t) => t.right > r.right + 2 || t.left < r.left - 2))
            faults.push({ ...describe(el), reason: 'text range escapes its reading surface' });
        }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        faults,
        legal,
      };
    });
}
