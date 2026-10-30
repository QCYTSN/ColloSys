import { readFileSync } from 'node:fs';
const read = (file) =>
  readFileSync(
    new URL(`../../third_party/codecast/upstream/${file}`, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
const list = 'packages/web/components/GenericListView.tsx',
  segmented = 'packages/web/components/SegmentedToggle.tsx';
function section(file, start, end, after) {
  const source = read(file),
    from = source.indexOf(start),
    to = end ? source.indexOf(end, from) : source.length;
  if (from < 0 || to <= from || source.indexOf(start, from + 1) !== -1)
    throw new Error(`Menu seam changed: ${file} ${start}`);
  return { file, before: source.slice(from, to), after };
}
export const menuPatches = [
  section(
    list,
    'function TabDropdown(',
    'export interface ListSortOption',
    'import { ProductTabDropdown as TabDropdown, ProductDisplayMenu as DisplayMenu, ProductAddFilterMenu as AddFilterMenu } from "../collo/ProductListMenus";\n\n',
  ),
  section(
    list,
    '/** One selectable row inside the Display popover',
    'export interface ListFilterDef',
    '',
  ),
  section(list, 'function AddFilterMenu(', 'export interface ListGroup', ''),
  section(
    segmented,
    'function SegmentedDropdown(',
    null,
    'import { ProductSegmentedDropdown as SegmentedDropdown } from "../collo/ProductListMenus";\n',
  ),
  // Profiling identifies repeated ICU construction in the activity rail.
  {
    file: 'packages/web/lib/utils.ts',
    before:
      'export { relTimeShort, formatRelative, formatShortDate, formatDateFull, formatDateSmart } from "@codecast/shared/time";',
    after:
      'export { relTimeShort, formatRelative, formatDateSmart } from "@codecast/shared/time";\nexport { formatShortDate, formatDateFull } from "../collo/ProductTime";',
  },
  {
    file: 'packages/web/lib/timelineRail.ts',
    before: 'import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";',
    after:
      'import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";\nimport { formatShortDate } from "../collo/ProductTime";',
  },
  {
    file: 'packages/web/lib/timelineRail.ts',
    before: `return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });`,
    after: 'return formatShortDate(ts, now);',
  },
  {
    file: 'packages/web/components/timeline/Rail.tsx',
    before: 'import { formatDateFull, relTimeShort } from "../../lib/utils";',
    after:
      'import { formatDateFull, relTimeShort } from "../../lib/utils";\nimport { formatClockTime } from "../../collo/ProductTime";',
  },
  {
    file: 'packages/web/components/timeline/Rail.tsx',
    before: 'new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })',
    after: 'formatClockTime(ts)',
  },
];
