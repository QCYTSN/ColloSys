import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentType,
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
