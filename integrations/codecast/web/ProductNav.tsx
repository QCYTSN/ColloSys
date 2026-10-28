import { usePathname } from 'next/navigation';
import { FolderSimple, CheckSquare, Chats, Users, GearSix, Plugs } from '@phosphor-icons/react';
import { NavSection, RailHeading } from '../components/sidebar/navPrimitives';
import type { UpstreamSidebarNavView } from '../components/sidebar/SidebarNav';
import { useInboxStore } from '../store/inboxStore';
import { productBrand } from './productBrand';
import { TeamSwitcher } from '../components/TeamSwitcher';
export function ProductNav({
  isNarrow,
  onMobileClose,
  active,
  tasks,
}: Parameters<typeof UpstreamSidebarNavView>[0]) {
  const pathname = usePathname() ?? '';
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
      <div className="collo-workspace-switch">
        <TeamSwitcher />
      </div>
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
        'Conversations',
        Chats,
        pathname === '/inbox' || pathname.startsWith('/conversation/'),
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
