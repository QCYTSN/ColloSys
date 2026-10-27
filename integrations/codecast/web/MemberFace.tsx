import { AvatarImg } from '../lib/avatarCache';
import { useTeamRosterIdentity, useViewerIdentity } from '../hooks/useTeamRoster';
export function MemberFace({ id, name, size = 26 }: { id: string; name: string; size?: number }) {
  const roster = useTeamRosterIdentity(),
    viewer = useViewerIdentity();
  const member = viewer?._id === id ? viewer : roster.find((m) => m._id === id);
  const tone = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % 5;
  const fallback = (
    <span
      className={`collo-member-face tone-${tone}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.43) }}
      title={name}
    >
      {name.trim().slice(0, 1).toLocaleUpperCase()}
    </span>
  );
  return (
    <AvatarImg
      src={member?.image || member?.github_avatar_url}
      alt={name}
      title={name}
      className="collo-member-face"
      style={{ width: size, height: size }}
      fallback={fallback}
    />
  );
}
