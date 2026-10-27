import { productBrand } from './productBrand';
const sizes = { sm: 24, md: 30, lg: 38, xl: 52 };
export function LogoMark({
  size = 24,
  className = '',
}: {
  size?: number;
  monochrome?: boolean;
  className?: string;
}) {
  return (
    <img
      src={productBrand.markUrl}
      srcSet="/collo-brand/mark-32.png 32w, /collo-brand/mark-64.png 64w, /collo-brand/mark-128.png 128w"
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      className={`collo-mark ${className}`}
    />
  );
}
export function Logo({
  size = 'md',
  showText = true,
  className = '',
}: {
  size?: keyof typeof sizes;
  showText?: boolean;
  className?: string;
}) {
  return (
    <span className={`collo-logo ${className}`}>
      <LogoMark size={sizes[size]} />
      {showText && <span>{productBrand.name}</span>}
    </span>
  );
}
export const LogoIcon = LogoMark;
