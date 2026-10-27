import { AgentTypeIcon, formatAgentType } from '../components/AgentTypeIcon';
import { FileText } from '@phosphor-icons/react';
import { normalizeAgentType } from './AgentIdentity';
export function AgentBadge({
  agent,
  manual = false,
  compact = false,
}: {
  agent?: string | null;
  manual?: boolean;
  compact?: boolean;
}) {
  const id = normalizeAgentType(agent);
  const label = manual ? 'Saved file' : formatAgentType(id);
  return (
    <span className="collo-agent" data-agent={manual ? 'manual' : id || 'unknown'} title={label}>
      {manual ? (
        <FileText size={16} />
      ) : (
        <AgentTypeIcon agentType={id} className="collo-agent-icon" />
      )}
      {!compact && <span>{label}</span>}
    </span>
  );
}
