// Geometry is checked before truncation. Ellipsis never excuses a clipped control.
export async function inspectOverflow(page, rootSelector = 'body') {
  return page
    .locator(rootSelector)
    .first()
    .evaluate((root) => {
      const faults = [],
        legal = [],
        fullTextCandidates = [],
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
        faults.push({ category: 'geometry', ...describe(el), reason, ...extra });
      };
      const code = (el) => !!el.closest('pre,code,[data-diff-code],.cm-editor,.monaco-editor');
      const visible = (el) => {
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
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
        const fixed = getComputedStyle(el).position === 'fixed';
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const ps = getComputedStyle(parent),
            pr = parent.getBoundingClientRect();
          const outsideX = r.left < pr.left - 2 || r.right > pr.right + 2;
          const outsideY = r.top < pr.top - 2 || r.bottom > pr.bottom + 2;
          if (
            !fixed &&
            /auto|scroll/.test(ps.overflowX) &&
            parent.scrollWidth > parent.clientWidth + 2
          )
            scrollX = true;
          if (
            !fixed &&
            /auto|scroll/.test(ps.overflowY) &&
            parent.scrollHeight > parent.clientHeight + 2
          )
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
        // Client dimensions exclude borders. Scale them into the same coordinate
        // system as Range rectangles (including CSS transforms and zoom).
        const scaleY = block.offsetHeight ? bounds.height / block.offsetHeight : 1;
        const clipTop = bounds.top + block.clientTop * scaleY;
        const clipBottom = clipTop + block.clientHeight * scaleY;
        const clippedY = rects.some((r) => r.top < clipTop - 2 || r.bottom > clipBottom + 2);
        const lineClamp = Number(style.webkitLineClamp) > 0;
        // A declared multi-line clamp intentionally removes later text lines.
        // Its first visible line and the control/ancestor geometry still must fit.
        const firstLineClipped = rects[0].top < clipTop - 2 || rects[0].bottom > clipBottom + 2;
        if (
          /hidden|clip/.test(style.overflowY) &&
          clippedY &&
          (!lineClamp || firstLineClipped) &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(block.tagName)
        )
          report(block, 'text is vertically clipped by its own surface', {
            clientHeight: block.clientHeight,
            scrollHeight: block.scrollHeight,
          });
        const truncated = style.textOverflow === 'ellipsis' || Number(style.webkitLineClamp) > 0;
        const cut =
          escapes ||
          block.scrollWidth > block.clientWidth + 2 ||
          (Number(style.webkitLineClamp) > 0 && block.scrollHeight > block.clientHeight + 2);
        if (truncated && cut) {
          const full = (block.textContent || '').trim(),
            provider = block.closest('[title]');
          if (provider?.getAttribute('title')?.includes(full))
            fullTextCandidates.push({
              ...describe(block),
              reason:
                'title matches text; keyboard/full-content access still requires interaction verification',
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
        fullTextCandidates,
      };
    });
}

// Probe only the active surface's meaningful actions. Trial never submits a form
// or executes a destructive handler. Restore each scroll container after probing.
export async function inspectActions(page, actions) {
  const faults = [],
    checks = [];
  for (let i = 0; i < (await actions.count()); i++) {
    const action = actions.nth(i);
    const info = await action.evaluate((el) => ({
      id: el.id,
      text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 160),
      excluded:
        !!el.closest('[inert],[aria-hidden=true]') ||
        getComputedStyle(el).display === 'none' ||
        getComputedStyle(el).visibility === 'hidden',
      disabled: el.matches(':disabled,[aria-disabled=true]'),
    }));
    if (info.excluded || info.disabled) continue;
    const scrolls = await action.evaluateHandle((el) => {
      const saved = [];
      for (let p = el.parentElement; p; p = p.parentElement)
        saved.push({ el: p, x: p.scrollLeft, y: p.scrollTop });
      saved.push({ el: document.scrollingElement, x: scrollX, y: scrollY });
      return saved;
    });
    try {
      let error;
      try {
        await action.scrollIntoViewIfNeeded({ timeout: 1500 });
        await action.click({ trial: true, timeout: 1500 });
      } catch (e) {
        error = e.message.slice(0, 1800);
      }
      const hit = await action.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const points = [
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + Math.min(6, r.width / 2), r.top + Math.min(6, r.height / 2)],
        ];
        const composedChild = (node) => {
          while (node) {
            if (node === el) return true;
            node = node.parentNode || node.host;
          }
          return false;
        };
        const samples = points.map(([x, y]) => {
          let target = document.elementFromPoint(x, y);
          while (target?.shadowRoot?.elementFromPoint(x, y))
            target = target.shadowRoot.elementFromPoint(x, y);
          return { x, y, hit: composedChild(target), target: target?.tagName };
        });
        return {
          rect: r.toJSON(),
          samples,
          inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        };
      });
      if (error)
        faults.push({
          ...info,
          category: hit.inViewport ? 'hit-testing' : 'reachability',
          reason: error,
          ...hit,
        });
      else checks.push({ ...info, category: 'reachable and actionable', ...hit });
    } finally {
      await page.evaluate((saved) => {
        for (const s of saved)
          if (s.el?.isConnected) s.el.scrollTo({ left: s.x, top: s.y, behavior: 'instant' });
      }, scrolls);
      await scrolls.dispose();
    }
  }
  return { faults, checks };
}
