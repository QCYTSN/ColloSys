// Selected pure functions from Codecast conversationScroll.ts (MIT).
// Commit 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8; Copyright (c) 2025 Codecast.
export function shouldFollowStreaming(userScrolled: boolean, openAtTop = false): boolean {
  if (openAtTop) return false;
  return !userScrolled;
}
export function initialScrollEdge(i: {
  guest: boolean;
  hasExplicitTarget: boolean;
}): 'top' | 'bottom' | null {
  if (i.hasExplicitTarget) return null;
  return i.guest ? 'top' : 'bottom';
}
export function shouldAdjustScrollForResize(i: {
  itemStart: number;
  scrollOffset: number;
  held: boolean;
}): boolean {
  if (i.held) return false;
  return i.itemStart < i.scrollOffset;
}
