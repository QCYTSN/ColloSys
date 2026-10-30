import { useEffect, useState, type ReactNode } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import {
  CaretDown,
  Check,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  LinkSimple,
  FunnelSimple,
  Plus,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import {
  ProductDropdownTrigger,
  ProductPopoverTrigger,
  ListTrigger,
  useTriggerAnchor,
} from './ProductControlTriggers';
import type { ListTab, ListSortOption, ListFilterDef } from '../components/GenericListView';
import type { SegmentedItem } from '../components/SegmentedToggle';
import { FilterOptionList } from './ProductFilters';

const Caret = () => <CaretDown size={12} data-collo-chevron className="cq-caret" aria-hidden />;
const Tick = () => (
  <Dropdown.ItemIndicator className="collo-list-tick">
    <Check size={14} weight="bold" />
  </Dropdown.ItemIndicator>
);

export function ProductTabDropdown({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: ListTab[];
  activeTab: string;
  onChange: (key: string) => void;
}) {
  const active = tabs.find((t) => t.key === activeTab);
  const label = active?.label ?? (activeTab ? 'Filtered' : (tabs[0]?.label ?? 'View'));
  const Icon = active?.icon,
    collapse = Icon ? 'cq-tab-label' : '';
  const anchor = useTriggerAnchor();
  return (
    <Dropdown.Root modal={false}>
      <ProductDropdownTrigger asChild>
        <ListTrigger ref={anchor.ref} title={label} aria-label={label}>
          {Icon && <Icon size={16} aria-hidden />}
          <span className={collapse}>{label}</span>
          {!!active?.count && (
            <span className={`collo-list-count ${collapse}`}>{active.count}</span>
          )}
          <Caret />
        </ListTrigger>
      </ProductDropdownTrigger>
      <Dropdown.Portal>
        <Dropdown.Content
          data-owns-keys
          aria-labelledby={undefined}
          ref={anchor.content}
          onInteractOutside={anchor.outside}
          onCloseAutoFocus={anchor.closeFocus}
          className="collo-list-surface collo-preset-menu"
          align="start"
          sideOffset={6}
          collisionPadding={10}
          loop
          aria-label="Task view presets"
        >
          <Dropdown.RadioGroup value={active ? activeTab : undefined} onValueChange={onChange}>
            {tabs.map((t) => {
              const I = t.icon;
              return (
                <Dropdown.RadioItem
                  key={t.key}
                  value={t.key}
                  className="collo-list-option"
                  textValue={t.label}
                  title={t.title}
                >
                  {I && <I size={16} aria-hidden />}
                  <span className="collo-option-label">{t.label}</span>
                  {!!t.count && <span className="collo-list-count">{t.count}</span>}
                  <Tick />
                </Dropdown.RadioItem>
              );
            })}
          </Dropdown.RadioGroup>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
  onEscapeAfterClose,
}: {
  label: string;
  value?: string;
  options: ListSortOption[];
  onChange: (v: string) => void;
  onEscapeAfterClose: () => void;
}) {
  const selected = options.find((o) => o.value === value);
  const anchor = useTriggerAnchor();
  return (
    <Dropdown.Root modal={false}>
      <ProductDropdownTrigger asChild>
        <ListTrigger
          ref={anchor.ref}
          className="collo-setting-select"
          aria-label={`${label}: ${selected?.label ?? value ?? 'None'}`}
        >
          <span className="collo-option-label">{selected?.label ?? value ?? 'None'}</span>
          <Caret />
        </ListTrigger>
      </ProductDropdownTrigger>
      <Dropdown.Portal>
        <Dropdown.Content
          data-owns-keys
          aria-labelledby={undefined}
          ref={anchor.content}
          onInteractOutside={anchor.outside}
          onCloseAutoFocus={anchor.closeFocus}
          onEscapeKeyDown={(event) => {
            // Presence retains this layer for its visual exit. Once a choice
            // has closed it, Escape belongs to the still-open settings panel.
            if (anchor.content.current?.dataset.state === 'closed') {
              event.preventDefault();
              onEscapeAfterClose();
            }
          }}
          className="collo-list-surface collo-setting-menu"
          align="end"
          sideOffset={4}
          collisionPadding={10}
          loop
          aria-label={label}
        >
          <Dropdown.RadioGroup value={value} onValueChange={onChange}>
            {options.map((o) => (
              <Dropdown.RadioItem
                className="collo-list-option"
                key={o.value}
                value={o.value}
                textValue={o.label}
              >
                <span className="collo-option-label">{o.label}</span>
                <Tick />
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function ProductDisplayMenu({
  groupBy,
  groupOptions,
  onGroupChange,
  subGroupBy,
  subGroupOptions,
  onSubGroupChange,
  sortBy,
  sortOptions,
  onSortChange,
  sortDir,
  onSortDirChange,
  extra,
  onCopyLink,
}: {
  groupBy?: string;
  groupOptions?: ListSortOption[];
  onGroupChange?: (v: string) => void;
  subGroupBy?: string;
  subGroupOptions?: ListSortOption[];
  onSubGroupChange?: (v: string) => void;
  sortBy: string;
  sortOptions: ListSortOption[];
  onSortChange: (v: string) => void;
  sortDir?: 'asc' | 'desc';
  onSortDirChange?: () => void;
  extra?: ReactNode;
  onCopyLink?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useTriggerAnchor();
  const Direction = sortDir === 'asc' ? ArrowUp : ArrowDown;
  const manual = sortBy === 'manual';
  const directionLabel = manual
    ? 'Manual order follows drag position'
    : sortDir === 'asc'
      ? 'Ascending — click for descending'
      : 'Descending — click for ascending';
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <ProductPopoverTrigger asChild>
        <ListTrigger ref={anchor.ref} title="Display options" aria-label="Display options">
          <SlidersHorizontal size={16} aria-hidden />
          <span className="cq-header-collapse">Display</span>
          <Caret />
        </ListTrigger>
      </ProductPopoverTrigger>
      <Popover.Portal>
        <Popover.Content
          data-owns-keys
          ref={anchor.content}
          onInteractOutside={anchor.outside}
          onCloseAutoFocus={anchor.closeFocus}
          className="collo-list-surface collo-display-panel"
          align="end"
          sideOffset={6}
          collisionPadding={10}
          aria-label="Display settings"
        >
          <div className="collo-display-heading">Display</div>
          {extra && <div className="collo-display-view">{extra}</div>}
          {groupOptions && onGroupChange && (
            <div className="collo-display-row">
              <span>Grouping</span>
              <SettingSelect
                label="Grouping"
                value={groupBy}
                options={groupOptions}
                onChange={onGroupChange}
                onEscapeAfterClose={() => setOpen(false)}
              />
            </div>
          )}
          {subGroupOptions &&
            subGroupOptions.length > 0 &&
            onSubGroupChange &&
            groupBy &&
            groupBy !== 'none' && (
              <div className="collo-display-row">
                <span>Then by</span>
                <SettingSelect
                  label="Then by"
                  value={subGroupBy}
                  options={subGroupOptions}
                  onChange={onSubGroupChange}
                  onEscapeAfterClose={() => setOpen(false)}
                />
              </div>
            )}
          <div className="collo-display-row">
            <span>Sorting</span>
            <div className="collo-sort-controls">
              <SettingSelect
                label="Sorting"
                value={sortBy}
                options={sortOptions}
                onChange={onSortChange}
                onEscapeAfterClose={() => setOpen(false)}
              />
              {sortDir && onSortDirChange && (
                <ListTrigger
                  className="collo-sort-direction"
                  onClick={onSortDirChange}
                  disabled={manual}
                  title={directionLabel}
                  aria-label={directionLabel}
                >
                  <Direction size={16} aria-hidden />
                </ListTrigger>
              )}
            </div>
          </div>
          {onCopyLink && (
            <button
              type="button"
              className="collo-copy-view"
              onClick={() => {
                onCopyLink();
                setOpen(false);
              }}
            >
              <LinkSimple size={16} aria-hidden />
              Copy link to this view
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ProductAddFilterMenu({
  defs,
  variant = 'add',
  active = false,
}: {
  defs: ListFilterDef[];
  variant?: 'add' | 'header';
  active?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [catKey, setCatKey] = useState<string | null>(null);
  const anchor = useTriggerAnchor();
  const content = anchor.content;
  const available = defs.filter((d) => !d.value || (d.presetValues ?? []).includes(d.value));
  const cat = defs.find((d) => d.key === catKey);
  useEffect(() => {
    if (open) content.current?.querySelector<HTMLElement>('input,button')?.focus();
  }, [catKey, open]);
  const toggle = (value: boolean) => {
    setOpen(value);
    if (value) setCatKey(null);
  };
  return (
    <Popover.Root open={open} onOpenChange={toggle}>
      <ProductPopoverTrigger asChild>
        <ListTrigger
          ref={anchor.ref}
          title={variant === 'header' ? 'Filter' : 'Add filter'}
          aria-label={variant === 'header' ? 'Filter' : 'Add filter'}
          data-filter-active={active || undefined}
        >
          {variant === 'header' ? (
            <FunnelSimple size={16} aria-hidden />
          ) : (
            <Plus size={16} aria-hidden />
          )}
          <span className={variant === 'header' ? 'cq-header-collapse' : 'cq-addfilter-label'}>
            Filter
          </span>
          {active && <span className="collo-filter-dot" />}
        </ListTrigger>
      </ProductPopoverTrigger>
      <Popover.Portal>
        <Popover.Content
          data-owns-keys
          ref={content}
          onInteractOutside={anchor.outside}
          onCloseAutoFocus={anchor.closeFocus}
          className="collo-list-surface collo-filter-panel"
          align={variant === 'header' ? 'end' : 'start'}
          sideOffset={6}
          collisionPadding={10}
          aria-label={cat ? `${cat.label} filter` : 'Add filter'}
          onEscapeKeyDown={(e) => {
            if (cat) {
              e.preventDefault();
              setCatKey(null);
            }
          }}
        >
          {cat ? (
            <>
              <button type="button" className="collo-filter-back" onClick={() => setCatKey(null)}>
                <CaretLeft size={14} />
                {cat.label}
              </button>
              <FilterOptionList
                key={cat.key}
                options={
                  cat.showEmptyOption ? cat.options : cat.options.filter((o) => o.key !== '')
                }
                value={cat.value}
                multi={cat.multi}
                onChange={cat.onChange}
                onPicked={() => setOpen(false)}
              />
            </>
          ) : available.length ? (
            available.map((d) => (
              <button
                type="button"
                className="collo-list-option"
                key={d.key}
                onClick={() => setCatKey(d.key)}
              >
                {d.icon}
                <span className="collo-option-label">{d.label}</span>
                <CaretRight size={13} aria-hidden />
              </button>
            ))
          ) : (
            <p className="collo-filter-empty">All filters added</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ProductSegmentedDropdown({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: SegmentedItem[];
}) {
  const active = items.find((i) => i.key === value) ?? items[0],
    Icon = active?.icon;
  const anchor = useTriggerAnchor();
  return (
    <div className="cq-seg-compact">
      <Dropdown.Root modal={false}>
        <ProductDropdownTrigger asChild>
          <ListTrigger
            ref={anchor.ref}
            title={active?.title ?? active?.label}
            aria-label={active?.label ?? active?.title ?? 'Choose view'}
          >
            {Icon && <Icon size={16} />}
            {active?.label}
            <Caret />
          </ListTrigger>
        </ProductDropdownTrigger>
        <Dropdown.Portal>
          <Dropdown.Content
            data-owns-keys
            aria-labelledby={undefined}
            ref={anchor.content}
            onInteractOutside={anchor.outside}
            onCloseAutoFocus={anchor.closeFocus}
            className="collo-list-surface collo-preset-menu"
            align="end"
            sideOffset={6}
            collisionPadding={10}
            loop
          >
            <Dropdown.RadioGroup value={value} onValueChange={onChange}>
              {items.map((i) => {
                const I = i.icon;
                return (
                  <Dropdown.RadioItem
                    className="collo-list-option"
                    key={i.key}
                    value={i.key}
                    disabled={i.disabled}
                    title={i.title}
                    textValue={i.label ?? i.title}
                  >
                    {I && <I size={16} />}
                    <span className="collo-option-label">{i.label ?? i.title}</span>
                    {!!i.count && <span className="collo-list-count">{i.count}</span>}
                    <Tick />
                  </Dropdown.RadioItem>
                );
              })}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
