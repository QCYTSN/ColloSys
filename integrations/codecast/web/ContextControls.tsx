import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Button } from '../components/ui/button';

// Reuse Codecast's actual control, including its pressed face and focus behavior.
// The preview chooses one of three faces rather than resetting every button.
export const WorkButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'> & { kind?: 'primary' | 'secondary' | 'quiet' }
>(({ kind = 'quiet', className = '', ...props }, ref) => (
  <Button
    ref={ref}
    variant={kind === 'primary' ? 'default' : kind === 'secondary' ? 'outline' : 'ghost'}
    className={`cw-button ${className}`}
    data-kind={kind}
    {...props}
  />
));
WorkButton.displayName = 'WorkButton';

export function MemberAvatar({
  member,
  small = false,
}: {
  member: { id: string; name: string };
  small?: boolean;
}) {
  const tone =
    member.id === 'me' ? 0 : 1 + ([...member.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4);
  return (
    <span
      className={`cw-avatar tone-${tone} ${small ? 'small' : ''}`}
      title={member.name}
      data-member={member.id}
      aria-hidden="true"
    >
      {member.name.slice(0, 1)}
    </span>
  );
}
