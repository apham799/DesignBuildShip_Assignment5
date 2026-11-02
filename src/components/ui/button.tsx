import Link from "next/link";
import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-md border-2 text-body font-semibold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:translate-y-0";

const variants: Record<Variant, string> = {
  primary:
    "border-green bg-green text-on-green shadow-card hover:border-green-deep hover:bg-green-deep disabled:border-disabled-bg disabled:bg-disabled-bg disabled:text-disabled disabled:shadow-none",
  secondary: "border-ink bg-surface text-ink hover:bg-cream disabled:border-disabled disabled:text-disabled disabled:hover:bg-surface",
  ghost: "border-transparent bg-transparent text-ink underline-offset-4 hover:bg-cream hover:underline disabled:text-disabled",
  danger: "border-error bg-surface text-error hover:bg-error-tint disabled:border-disabled disabled:text-disabled disabled:hover:bg-surface",
};

// Large targets: these get tapped with a glove on, standing on a tee box.
const sizes: Record<Size, string> = {
  sm: "h-10 px-3",
  md: "h-12 px-5",
  lg: "h-14 px-6",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
};

export function Button({ variant = "primary", size = "md", icon, block, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(base, variants[variant], sizes[size], block && "w-full", className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
};

// A link styled as a button, for actions that navigate.
export function ButtonLink({ href, variant = "primary", size = "md", icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={cx(base, variants[variant], sizes[size], block && "w-full", className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function TextLink({ href, className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link href={href} className={cx("rounded-sm font-semibold text-green underline decoration-green/40 decoration-2 underline-offset-[3px] hover:decoration-green", className)} {...rest}>
      {children}
    </Link>
  );
}
