"use client";

import { useEffect, type ReactNode } from "react";
import { cx } from "./cx";
import { ErrorIcon } from "./icons";

type AlertTone = "info" | "success" | "warning" | "error";

const alertTone: Record<AlertTone, string> = {
  info: "border-cream-deep bg-cream text-ink",
  success: "border-success/40 bg-success-tint text-ink",
  warning: "border-warning/40 bg-warning-tint text-ink",
  error: "border-error/40 bg-error-tint text-ink",
};

// A message inside the page. Errors get the error icon and role="alert".
// Pass onDismiss to give it a close button.
export function Alert({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
}: {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cx("flex gap-3 rounded-lg border-2 p-4", alertTone[tone])}>
      {tone === "error" && <ErrorIcon className="mt-0.5 size-5 text-error" />}
      <div className="flex flex-1 flex-col gap-1">
        <p className={cx("text-body font-semibold", tone === "error" && "text-error")}>{title}</p>
        {children && <div className="text-body">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss: ${title}`}
          className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-md text-ink transition-colors hover:bg-black/5"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// A short confirmation that floats above the bottom nav and fades on its own.
// Always mounted so screen readers pick up changes in the live region.
export function Toast({ message, onDone, duration = 3000 }: { message: string | null; onDone: () => void; duration?: number }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, onDone, duration]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 sm:bottom-8">
      {message && (
        <p className="pointer-events-auto flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-body font-semibold text-white shadow-lift">
          <svg viewBox="0 0 16 16" className="size-4 text-white" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
          </svg>
          {message}
        </p>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("rounded-md bg-cream motion-safe:animate-pulse", className)} />;
}

// Shown while the page loads your saved data, so the first-visit and
// welcome-back versions never flash into each other.
export function LoadingCard({ label = "Loading your notes…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cx("motion-safe:animate-spin", className)} aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
