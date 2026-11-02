import type { ReactNode } from "react";
import { cx } from "./cx";

// Page layout. Phones and tablets get one centered column (max 768px); from 1024px
// pages split into columns on a 12-column grid: a wide primary column (8) for the
// task, and a narrow supporting one (4), so it's always clear where to look. DOM order is the phone order, so
// reading and Tab order stay the same at every size.

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto flex w-full max-w-3xl flex-col gap-6 lg:max-w-none", className)}>{children}</div>;
}

export function Columns({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12 lg:gap-y-6", className)}>{children}</div>;
}

const spans = {
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
} as const;

type ColumnProps = {
  children: ReactNode;
  span: keyof typeof spans;
  // Stays in view while the other column scrolls (below the 64px header).
  sticky?: boolean;
  className?: string;
};

export function Column({ children, span, sticky, className }: ColumnProps) {
  return <div className={cx("flex min-w-0 flex-col gap-6", spans[span], sticky && "lg:sticky lg:top-24", className)}>{children}</div>;
}
