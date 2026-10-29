// A programmatic change moves every sibling track together. Pointer resizing
// bypasses this presentation layer and stays owned by react-resizable-panels.
const running = new WeakMap<HTMLElement, () => void>();
export function transitionProductPanels(
  group: HTMLElement | null,
  change: () => void,
  done?: () => void,
) {
  if (!group) {
    change();
    done?.();
    return;
  }
  running.get(group)?.();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) {
    change();
    done?.();
    return;
  }
  let active = true;
  let frame = 0;
  const finish = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    group.classList.remove('collo-panels-moving');
    group.removeEventListener('pointerdown', finish, true);
    window.removeEventListener('resize', finish);
    reduced.removeEventListener('change', finish);
    running.delete(group);
    done?.();
  };
  running.set(group, finish);
  group.classList.add('collo-panels-moving');
  // Establish the current geometry before the library writes both flex tracks.
  void group.offsetWidth;
  group.addEventListener('pointerdown', finish, true);
  window.addEventListener('resize', finish);
  reduced.addEventListener('change', finish);
  change();
  frame = requestAnimationFrame(() => {
    if (!active) return;
    const panels = [...group.children].filter((el) => el.hasAttribute('data-panel'));
    const animations = panels.flatMap((el) => el.getAnimations());
    if (!animations.length) finish();
    else void Promise.allSettled(animations.map((a) => a.finished)).then(finish);
  });
  return finish;
}
