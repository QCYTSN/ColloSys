import * as React from 'react';
import * as Primitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/utils';
import { HoverCardsOff } from '../lib/hoverCardsOff';

// Portals retain React context. A hint belongs to its trigger's surface, so a
// lower-page hint stays below a menu, while a hint inside that menu stays usable.
const Layer = React.createContext({ z: 140, set: (_z: number) => {} });
export const TooltipProvider = Primitive.Provider;
export function Tooltip(props: React.ComponentProps<typeof Primitive.Root>) {
  const [z, set] = React.useState(140);
  return (
    <Layer.Provider value={{ z, set }}>
      <Primitive.Root {...props} />
    </Layer.Provider>
  );
}
export const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof Primitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof Primitive.Trigger>
>(({ onPointerEnter, onFocus, ...props }, ref) => {
  const layer = React.useContext(Layer);
  const locate = (el: HTMLElement) => {
    const surface = el.closest(
      '[data-collo-floating],.collo-menu-surface,.collo-dialog-surface,.collo-settings-surface',
    );
    layer.set(
      !surface
        ? 140
        : surface.matches('.collo-settings-surface')
          ? 160
          : surface.matches('.collo-dialog-surface')
            ? 205
            : 220,
    );
  };
  return (
    <Primitive.Trigger
      {...props}
      ref={ref}
      onPointerEnter={(e) => {
        locate(e.currentTarget);
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        locate(e.currentTarget);
        onFocus?.(e);
      }}
    />
  );
});
export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, sideOffset = 6, style, ...props }, ref) => {
  const layer = React.useContext(Layer),
    disabled = React.useContext(HoverCardsOff);
  if (disabled) return null;
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={12}
        hideWhenDetached
        data-collo-hint=""
        style={{ ...style, zIndex: layer.z }}
        className={cn('collo-hint', className)}
      />
    </Primitive.Portal>
  );
});
TooltipTrigger.displayName = 'TooltipTrigger';
TooltipContent.displayName = 'TooltipContent';
