import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ComponentProps,
  type RefAttributes,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';

export interface ProductTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}
function productTrigger(
  Primitive: ComponentType<ProductTriggerProps & RefAttributes<HTMLButtonElement>>,
  kind: string,
) {
  const Trigger = forwardRef<HTMLButtonElement, ProductTriggerProps>((props, ref) => (
    <Primitive {...props} ref={ref} data-collo-trigger={kind} />
  ));
  Trigger.displayName = `Product${kind}Trigger`;
  return Trigger;
}
// Radix continues to own open state, asChild composition, keyboard handling and
// focus restoration. There is one button and one forwarded event/ref chain.
export const ProductPopoverTrigger = productTrigger(Popover.Trigger, 'Popover');
export const ProductDropdownTrigger = productTrigger(Dropdown.Trigger, 'Dropdown');
export const ProductDialogTrigger = productTrigger(Dialog.Trigger, 'Dialog');
export const ProductSheetTrigger = productTrigger(Dialog.Trigger, 'Sheet');

/** The button remains the stable positioning anchor. Only its inner visual layer
 * responds to press; Radix owns opening, dismissal, presence and focus. */
export const ListTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ children, className = '', onPointerDown, onKeyDown, ...props }, ref) => {
    const face = useRef<HTMLSpanElement>(null),
      motion = useRef<Animation | null>(null);
    useEffect(() => () => motion.current?.cancel(), []);
    const press = () => {
      if (props.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      motion.current?.cancel();
      motion.current =
        face.current?.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(.975)', offset: 0.32 },
            { transform: 'scale(1)' },
          ],
          { duration: 210, easing: 'cubic-bezier(.2,.7,.25,1)' },
        ) ?? null;
    };
    return (
      <button
        {...props}
        data-owns-keys
        ref={ref}
        type={props.type ?? 'button'}
        className={`collo-list-trigger ${className}`}
        onPointerDown={(e) => {
          if (e.button === 0) press();
          onPointerDown?.(e);
        }}
        onKeyDown={(e) => {
          if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) press();
          onKeyDown?.(e);
        }}
      >
        <span className="collo-trigger-face" ref={face}>
          {children}
        </span>
      </button>
    );
  },
);
ListTrigger.displayName = 'ListTrigger';

export function useTriggerAnchor() {
  const ref = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeFocus: NonNullable<ComponentProps<typeof Dropdown.Content>['onCloseAutoFocus']> = (
    event,
  ) => {
    const focused = document.activeElement;
    // A newer choice/input may already own focus during this layer's exit.
    // Do not let the older layer steal it and dismiss the new child.
    if (
      focused &&
      focused !== document.body &&
      focused !== ref.current &&
      !content.current?.contains(focused)
    )
      event.preventDefault();
  };
  const outside: NonNullable<ComponentProps<typeof Dropdown.Content>['onInteractOutside']> = (
    event,
  ) => {
    // Nonmodal Radix layers remain mounted for their exit animation. A quick
    // second trigger press belongs to the trigger, including while closing;
    // it must not also dismiss the newly opened layer. This cancels only the
    // custom outside-dismiss event, never the pointer/key event or opening.
    if (ref.current?.contains(event.target as Node)) event.preventDefault();
  };
  return { ref, content, outside, closeFocus };
}
