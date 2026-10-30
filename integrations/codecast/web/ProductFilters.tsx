import { Fragment, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CaretDown, Check, X } from '@phosphor-icons/react';
import { ProductPopoverTrigger, ListTrigger, useTriggerAnchor } from './ProductControlTriggers';

export type FilterOption = {
  key: string;
  label: string;
  icon?: any;
  color?: string;
  face?: ReactNode;
  section?: string;
  count?: number;
};
// Keep the opening order stable while toggling; shared/obsolete values remain removable.
function pickedFirst(options: FilterOption[], picked: Set<string>): FilterOption[] {
  if (!picked.size) return options;
  const byKey = new Map(options.map((o) => [o.key, o]));
  return [
    ...options.filter((o) => o.key === ''),
    ...[...picked].map((k) => ({ ...(byKey.get(k) ?? { key: k, label: k }), section: undefined })),
    ...options.filter((o) => o.key !== '' && !picked.has(o.key)),
  ];
}
/** Standalone native form semantics also work in the existing decision/initiative
 * popovers. No dependency on a surrounding Dropdown context is introduced. */
export function FilterOptionList({
  options,
  value,
  multi,
  onChange,
  onPicked,
  searchable,
}: {
  options: FilterOption[];
  value: string;
  multi?: boolean;
  onChange: (v: string) => void;
  onPicked?: () => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState(''),
    [openedWith] = useState(value);
  const name = useId(),
    list = useRef<HTMLFieldSetElement>(null);
  const showSearch = searchable ?? options.length > 10;
  const selected = new Set(value ? value.split(',') : []);
  const ordered = useMemo(() => {
    if (!multi) return options;
    const picked = new Set(openedWith ? openedWith.split(',') : []);
    for (const k of value.split(',')) if (k && !options.some((o) => o.key === k)) picked.add(k);
    return pickedFirst(options, picked);
  }, [options, multi, openedWith, value]);
  const shown = ordered.filter(
    (o) =>
      !showSearch ||
      !query.trim() ||
      o.key === '' ||
      o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const hasValue = multi ? !!selected.size : !!value;
  const choose = (key: string) => {
    if (!multi) {
      onChange(key);
      onPicked?.();
      return;
    }
    if (key === '') {
      onChange('');
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next].join(','));
  };
  return (
    <>
      {showSearch && (
        <div className="collo-filter-search">
          <input
            type="search"
            autoFocus
            aria-label="Search filter options"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Tab') return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                list.current?.querySelector<HTMLInputElement>('input')?.focus();
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const hits = shown.filter((o) => o.key !== '');
                if (hits.length === 1) choose(hits[0].key);
              }
              e.stopPropagation();
            }}
          />
        </div>
      )}
      <fieldset
        className="collo-filter-options"
        data-owns-keys
        ref={list}
        aria-label="Filter options"
      >
        {shown.map((o, i) => {
          const Icon = o.icon,
            checked = o.key === '' ? !hasValue : multi ? selected.has(o.key) : o.key === value;
          return (
            <Fragment key={o.key}>
              {o.section && o.section !== shown[i - 1]?.section && (
                <div className="collo-filter-section">{o.section}</div>
              )}
              <label
                className="collo-list-option collo-filter-option"
                data-selected={checked}
                title={o.label}
              >
                <input
                  name={name}
                  type={multi ? 'checkbox' : 'radio'}
                  value={o.key}
                  checked={checked}
                  onChange={() => choose(o.key)}
                  onClick={() => {
                    if (!multi && checked) onPicked?.();
                  }}
                />
                {o.face ?? (Icon && <Icon size={16} className={o.color ?? ''} aria-hidden />)}
                <span className="collo-option-label">{o.label}</span>
                {!!o.count && <span className="collo-list-count">{o.count}</span>}
                <span className="collo-filter-check" aria-hidden>
                  {checked && <Check size={14} weight="bold" />}
                </span>
              </label>
            </Fragment>
          );
        })}
        {!shown.length && <p className="collo-filter-empty">No match</p>}
      </fieldset>
    </>
  );
}

export function FilterDropdown({
  label,
  icon,
  value,
  options,
  onChange,
  multi,
  chip,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  multi?: boolean;
  chip?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useTriggerAnchor();
  const picked = value ? value.split(',') : [],
    hasValue = multi ? !!picked.length : !!value;
  const labels = picked.map((k) => options.find((o) => o.key === k)?.label ?? k);
  const text =
    multi && hasValue
      ? `${labels.slice(0, 2).join(', ')}${labels.length > 2 ? ` +${labels.length - 2}` : ''}`
      : value
        ? (options.find((o) => o.key === value)?.label ?? value)
        : label;
  if (chip && !hasValue) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={chip ? 'collo-filter-chip' : undefined}>
        <ProductPopoverTrigger asChild>
          <ListTrigger
            ref={anchor.ref}
            title={chip ? `Edit ${label}` : label}
            aria-label={chip ? `Edit ${label}: ${text}` : `${label}: ${text}`}
            data-filter-active={hasValue || undefined}
          >
            {icon}
            <span className="collo-filter-summary">{text}</span>
            {!chip && <CaretDown size={12} data-collo-chevron aria-hidden />}
          </ListTrigger>
        </ProductPopoverTrigger>
        {chip && (
          <button
            type="button"
            title={`Remove ${label} filter`}
            aria-label={`Remove ${label} filter`}
            onClick={() => onChange('')}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          data-owns-keys
          ref={anchor.content}
          onInteractOutside={anchor.outside}
          onCloseAutoFocus={anchor.closeFocus}
          className="collo-list-surface collo-filter-panel"
          align="start"
          sideOffset={6}
          collisionPadding={10}
          aria-label={`${label} filter`}
        >
          <FilterOptionList
            options={options}
            value={value}
            multi={multi}
            onChange={onChange}
            onPicked={() => setOpen(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
