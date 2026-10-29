import type { ReactNode } from 'react';
import Link from 'next/link';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { ArrowLeft, CaretDown } from '@phosphor-icons/react';
import { IntentTitle } from '../components/initiatives/IntentHeader';
import type { ProjectItem } from '../store/inboxStore';
import { ProjectIdentityEditor, ProjectIdentityMark } from './ProjectIdentity';
import { readProjectIdentity } from './productContracts';
export interface ProductProjectHeaderProps {
  back: { href: string; label: string };
  title: string;
  project?: Pick<ProjectItem, '_id' | 'title' | 'identity' | 'identityRevision' | 'icon' | 'color'>;
  glyph?: ReactNode;
  onRename?: (title: string) => void;
  renameLabel?: string;
  titleData?: Record<`data-${string}`, string | undefined>;
  idChip?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  accent?: string;
  phone?: boolean;
}
export function ProductProjectHeader({
  back,
  title,
  project,
  glyph,
  onRename,
  renameLabel,
  titleData,
  idChip,
  chips,
  actions,
  tabs,
  accent,
  phone,
}: ProductProjectHeaderProps) {
  return (
    <header className="collo-project-header">
      <div className="collo-project-identity">
        <Link href={back.href} className="collo-icon-button" aria-label={back.label}>
          <ArrowLeft size={18} />
        </Link>
        {project ? <ProjectIdentityEditor project={project} trigger={<ProjectIdentityMark identity={readProjectIdentity(project)} />} /> : glyph}
        <div className="collo-project-title">
          <IntentTitle
            title={title}
            onRename={onRename}
            label={renameLabel}
            data={titleData}
            accent={accent ?? 'var(--collo-accent)'}
            phone={phone}
          />
        </div>
        <Popover>
          <PopoverTrigger className="collo-project-properties">
            Project details <CaretDown size={14} data-collo-chevron />
          </PopoverTrigger>
          <PopoverContent align="end" className="collo-menu-surface collo-project-property-menu">
            {idChip}
            {chips}
          </PopoverContent>
        </Popover>
        <div className="collo-project-actions">{actions}</div>
      </div>
      <div className="collo-project-tools">{tabs}</div>
    </header>
  );
}
