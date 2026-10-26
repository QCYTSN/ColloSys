import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  CloudSlashIcon,
  CodeIcon,
  CommandIcon,
  CopyIcon,
  DotsThreeIcon,
  FileCodeIcon,
  FolderSimpleIcon,
  FunnelSimpleIcon,
  GearSixIcon,
  GitBranchIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RobotIcon,
  SidebarSimpleIcon,
  SpinnerGapIcon,
  StackIcon,
  UsersIcon,
  WarningCircleIcon,
  WifiSlashIcon,
  XIcon,
  ChatCircleTextIcon,
  BookmarkSimpleIcon,
  LockSimpleIcon,
  ArrowSquareOutIcon,
  type IconProps,
} from '@phosphor-icons/react';

const icons = {
  back: ArrowLeftIcon,
  next: ArrowRightIcon,
  down: ArrowDownIcon,
  refresh: ArrowsClockwiseIcon,
  chevron: CaretDownIcon,
  right: CaretRightIcon,
  check: CheckIcon,
  complete: CheckCircleIcon,
  circle: CircleIcon,
  clock: ClockIcon,
  cloud: CloudSlashIcon,
  code: CodeIcon,
  command: CommandIcon,
  copy: CopyIcon,
  more: DotsThreeIcon,
  file: FileCodeIcon,
  folder: FolderSimpleIcon,
  filter: FunnelSimpleIcon,
  settings: GearSixIcon,
  branch: GitBranchIcon,
  list: ListIcon,
  search: MagnifyingGlassIcon,
  device: MonitorIcon,
  pause: PauseIcon,
  play: PlayIcon,
  plus: PlusIcon,
  agent: RobotIcon,
  panel: SidebarSimpleIcon,
  loading: SpinnerGapIcon,
  checkpoint: StackIcon,
  members: UsersIcon,
  warning: WarningCircleIcon,
  offline: WifiSlashIcon,
  close: XIcon,
  conversation: ChatCircleTextIcon,
  bookmark: BookmarkSimpleIcon,
  lock: LockSimpleIcon,
  external: ArrowSquareOutIcon,
};
export type AppIconName = keyof typeof icons;
export function AppIcon({
  name,
  size = 18,
  weight = 'regular',
  ...props
}: IconProps & { name: AppIconName }) {
  const Icon = icons[name];
  return <Icon size={size} weight={weight} aria-hidden="true" {...props} />;
}

/** The user's actual supplied artwork, cropped by viewport rather than redrawn. */
export function PeanutMark() {
  return (
    <svg className="pn-logo" viewBox="470 440 245 160" role="img" aria-label="花生工坊标志">
      <image href="/collo-design/peanut-reference.png" width="1200" height="1200" />
    </svg>
  );
}
