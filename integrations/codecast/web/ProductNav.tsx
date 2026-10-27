import { usePathname, useSearchParams } from 'next/navigation';
import {
  FolderSimple,
  CheckSquare,
  Chats,
  Users,
  GearSix,
  ClockCounterClockwise,
  ArrowsLeftRight,
  Plugs,
  Pulse,
} from '@phosphor-icons/react';
import { NavSection, RailHeading } from '../components/sidebar/navPrimitives';
import type { UpstreamSidebarNavView } from '../components/sidebar/SidebarNav';
import { useInboxStore } from '../store/inboxStore';
import { productBrand } from './productBrand';
export function ProductNav({
  isNarrow,
  onMobileClose,
  active,
  tasks,
}: Parameters<typeof UpstreamSidebarNavView>[0]) {
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const activePath = useInboxStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path);
  const project = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const activeParams =
    activePath?.split('?')[0] === pathname
      ? new URLSearchParams(activePath.split('?')[1] ?? '')
      : params;
  const tab = activeParams.get('tab') ?? (pathname.split('/').length > 3 ? 'tasks' : 'workspaces');
  const history = activeParams.get('workspaceView') === 'history';
  const item = (href: string, label: string, Icon: typeof FolderSimple, selected: boolean) => (
    <NavSection
      key={label}
      href={href}
      label={label}
      isActive={selected}
      isNarrow={isNarrow}
      onMobileClose={onMobileClose}
      icon={<Icon size={19} />}
    />
  );
  return (
    <div className="collo-navigation">
      <RailHeading label="Workspace" isNarrow={isNarrow} />
      {item('/projects', 'Projects', FolderSimple, !!active.projects)}
      <NavSection
        href="/tasks"
        label="Tasks"
        isActive={active.tasks}
        isNarrow={isNarrow}
        onMobileClose={onMobileClose}
        icon={<CheckSquare size={19} />}
        items={tasks.onDrill ? undefined : tasks.items}
        expanded={tasks.expanded}
        onToggle={tasks.onToggle}
        onDrill={tasks.onDrill}
      />
      {item(
        '/inbox',
        'Sessions',
        Chats,
        pathname === '/inbox' || pathname.startsWith('/conversation/'),
      )}
      {project && (
        <div className="collo-project-navigation">
          <RailHeading label="This project" isNarrow={isNarrow} />
          {item(
            `/projects/${project}?tab=workspaces`,
            'Team activity',
            Pulse,
            tab === 'workspaces' && !history,
          )}
          {item(`/projects/${project}?tab=sessions`, 'Conversations', Chats, tab === 'sessions')}
          {item(
            `/projects/${project}?tab=handoffs`,
            'Handoffs',
            ArrowsLeftRight,
            tab === 'handoffs',
          )}
          {item(
            `/projects/${project}?tab=workspaces&workspaceView=history`,
            'My directories',
            ClockCounterClockwise,
            tab === 'workspaces' && history,
          )}
        </div>
      )}
      <div className="collo-nav-settings">
        <RailHeading label="Manage" isNarrow={isNarrow} />
        {item('/settings/team', 'Team', Users, pathname.startsWith('/settings/team'))}
        {item(
          '/settings/integrations',
          'Connections',
          Plugs,
          pathname.startsWith('/settings/integrations'),
        )}
        <button
          className="collo-settings-button"
          onClick={() => {
            useInboxStore.getState().openSettingsModal();
            onMobileClose?.();
          }}
          title="Settings"
        >
          <GearSix size={19} />
          {!isNarrow && 'Settings'}
        </button>
        {!isNarrow && (
          <span className="collo-nav-version">
            {productBrand.name} <span>{productBrand.version}</span>
          </span>
        )}
      </div>
    </div>
  );
}
