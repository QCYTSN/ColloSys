import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ConversationView } from '../components/ConversationView';
import type { ConversationData } from '../components/conversation/types';
import { designActivities } from './DesignScenario';

/** Actual upstream reader with the SAME fixture, not a restyled approximation.
 * Read-only, no composer, no model execution; non-database IDs prevent this
 * fixture being mistaken for a production conversation. Existing app providers
 * supply the original store/theme. The rest of the native product is not mocked.
 */
export function DesignReference() {
  const [params, setParams] = useSearchParams();
  const item = designActivities.find((a) => a.id === params.get('activity')) || designActivities[0];
  const conversation = useMemo<ConversationData>(
    () => ({
      _id: `design-reference-${item.id}` as ConversationData['_id'],
      session_id: `design-reference-${item.id}`,
      title: item.title,
      user: { name: item.person },
      agent_type: item.agent === 'Codex' ? 'codex' : 'claude',
      git_branch: item.branch,
      status: 'completed',
      is_own: false,
      message_count: item.messages.length,
      messages: item.messages.map((m, i) => ({
        _id: `design-reference-${item.id}-${m.id}`,
        role: m.role,
        content: m.text,
        timestamp: Date.parse(`2026-10-25T${m.time}:00+08:00`) || 1792908000000 + i * 60000,
      })),
    }),
    [item],
  );
  return (
    <div className="pn-native-reference">
      <div className="pn-reference-bar">
        <span>Codecast 原生会话组件 · 相同测试内容</span>
        <button
          onClick={() =>
            setParams((old) => {
              const next = new URLSearchParams(old);
              next.delete('reference');
              return next;
            })
          }
        >
          返回新样板
        </button>
      </div>
      <div className="pn-reference-reader">
        <ConversationView
          conversation={conversation}
          backHref="/design-lab"
          embedded
          guest
          isOwner={false}
          showMessageInput={false}
          openAtTop
          initialDensity="full"
        />
      </div>
    </div>
  );
}
