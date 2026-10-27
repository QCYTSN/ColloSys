import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from './ProductLogo';
export function ProductHeader({
  nav,
  workspace,
  search,
  status,
  actions,
  panels,
}: Record<'nav' | 'workspace' | 'search' | 'status' | 'actions' | 'panels', ReactNode>) {
  return (
    <div className="collo-topbar">
      <Link className="collo-home" href="/projects" aria-label="ColloSys projects">
        <Logo />
      </Link>
      <div className="collo-topbar-nav">{nav}</div>
      <div className="collo-topbar-workspace">{workspace}</div>
      <div className="collo-topbar-search">{search}</div>
      <div className="collo-topbar-status">{status}</div>
      <div className="collo-topbar-actions">
        {actions}
        {panels}
      </div>
    </div>
  );
}
