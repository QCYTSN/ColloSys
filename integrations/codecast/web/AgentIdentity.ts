// IDs are identities, not claims that a local capture adapter is installed.
const aliases: Record<string, string> = {
  codex_cli: 'codex',
  'codex-cli': 'codex',
  openai_codex: 'codex',
  claude: 'claude_code',
  'claude-code': 'claude_code',
  claude_cli: 'claude_code',
  gemini_cli: 'gemini',
  'gemini-cli': 'gemini',
  cursor_agent: 'cursor',
  open_code: 'opencode',
  'open-code': 'opencode',
};
export function normalizeAgentType(value?: string | null): string {
  const id = value?.trim().toLowerCase() ?? '';
  return aliases[id] ?? id;
}
