import { cx } from "./cx";

// Always next to words that say the same thing, so it's hidden from screen readers.
export function ErrorIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx("shrink-0", className)} aria-hidden>
      <circle cx="8" cy="8" r="7.5" fill="currentColor" />
      <rect x="7.1" y="3.6" width="1.8" height="5.6" rx="0.6" fill="#fff" />
      <rect x="7.1" y="10.7" width="1.8" height="1.8" rx="0.6" fill="#fff" />
    </svg>
  );
}
