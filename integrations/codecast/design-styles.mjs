import design from './web/design-tokens.json' with { type: 'json' };

// The specification is the single source of primitives. Preparation places this
// before the existing component CSS; boot receives exactly the same variables.
export function designStyles() {
  const vars = [];
  for (const [key, value] of Object.entries(design.color.light))
    vars.push(`--collo-${key}:${value}`);
  for (const [key, value] of Object.entries(design.radius))
    vars.push(`--collo-radius-${key}:${value}px`);
  for (const value of design.space) vars.push(`--collo-space-${value}:${value}px`);
  const families = {
    ui: '"Google Sans","Noto Sans SC","Microsoft YaHei UI",sans-serif',
    editorial: '"Newsreader","Noto Sans SC",serif',
    mono: '"Cascadia Code",Consolas,"Noto Sans SC",monospace',
  };
  for (const [name, value] of Object.entries(families)) vars.push(`--collo-font-${name}:${value}`);
  for (const [role, value] of Object.entries(design.font.roles)) {
    vars.push(
      `--collo-type-${role}:${value.weight} ${value.size}px/${value.lineHeight}px var(--collo-font-${value.family})`,
    );
  }
  for (const [name, value] of Object.entries(design.motion)) {
    const cssName = name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    vars.push(
      `--collo-motion-${cssName}:${value}${name.endsWith('Ms') ? 'ms' : typeof value === 'number' ? 'px' : ''}`,
    );
  }
  for (const [name, value] of Object.entries(design.shadow))
    vars.push(`--collo-shadow-${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${value}`);
  const aliases = {
    content: 'surface-content',
    app: 'surface-app',
    tool: 'surface-subtle',
    floating: 'surface-floating',
    ink: 'text-primary',
    secondary: 'text-secondary',
    tertiary: 'text-tertiary',
    line: 'border-divider',
    'control-edge': 'border-control',
    action: 'action-primary',
    'on-action': 'on-primary',
    selected: 'selection-bg',
    positive: 'success',
    link: 'accent',
    rule: 'border-divider',
    edge: 'border-divider',
  };
  for (const [name, role] of Object.entries(aliases))
    vars.push(`--collo-${name}:var(--collo-${role})`);
  vars.push(
    '--font-ui:var(--collo-font-ui)',
    '--font-sans:var(--collo-font-ui)',
    '--font-mono:var(--collo-font-mono)',
    '--collo-radius-compact:var(--collo-radius-control)',
    '--collo-radius:var(--collo-radius-control)',
    '--collo-shadow:var(--collo-shadow-menu)',
    '--collo-float-shadow:var(--collo-shadow-menu)',
    '--collo-floating-filter:none',
    '--collo-motion-panel:200ms var(--collo-motion-ease-out)',
    '--collo-z-hint:140',
    '--collo-z-menu:210',
    '--collo-z-menu-hint:220',
    '--collo-accent-soft:var(--collo-selection-bg)',
  );
  return `@font-face{font-family:'Google Sans';src:url('/collo-design/GoogleSans.ttf') format('truetype');font-style:normal;font-weight:400 700;font-display:swap}
@font-face{font-family:'Noto Sans SC';src:url('/collo-design/NotoSansSC.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}
@font-face{font-family:'Newsreader';src:url('/collo-design/Newsreader.woff2') format('woff2');font-style:normal;font-weight:200 800;font-display:swap}
:root{${vars.join(';')}}
.dark{${Object.entries(design.color.dark)
    .map(([key, value]) => `--collo-${key}:${value}`)
    .join(';')}}
`;
}
