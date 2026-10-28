import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { ArrowLeft, CaretDown } from '@phosphor-icons/react';
import { IntentTitle, type IntentHeader } from '../components/initiatives/IntentHeader';
export function ProductProjectHeader({
  back,
  title,
  onRename,
  renameLabel,
  titleData,
  idChip,
  chips,
  actions,
  tabs,
  accent,
  phone,
}: ComponentProps<typeof IntentHeader>) {
  return (
    <header className="collo-project-header">
      <div className="collo-project-identity">
        <Link href={back.href} className="collo-icon-button" aria-label={back.label}>
          <ArrowLeft size={18} />
        </Link>
        <div className="collo-project-title">
          <IntentTitle
            title={title}
            onRename={onRename}
            label={renameLabel}
            data={titleData}
            accent={accent ?? 'var(--sol-violet)'}
            phone={phone}
          />
        </div>
        <Popover>
          <PopoverTrigger className="collo-project-properties">
            Project details <CaretDown size={14} />
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
