import type { Location } from "@/lib/types";
import { cx } from "@/components/ui";

// Choose what you follow. Each choice saves right away (a row in follows, which
// only you can see). Real toggle buttons, so they work with a keyboard and say
// "pressed" to a screen reader.

type Props = {
  locations: Location[];
  following: Set<string>;
  onToggle: (id: string) => void;
};

function Group({ title, items, following, onToggle }: Omit<Props, "locations"> & { title: string; items: Location[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label text-muted">{title}</legend>
      <ul className="flex flex-wrap gap-2">
        {items.map((l) => {
          const on = following.has(l.id);
          return (
            <li key={l.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(l.id)}
                className={cx(
                  "flex h-12 items-center gap-2 rounded-full border-2 px-4 text-body font-semibold transition-colors",
                  on ? "border-green bg-green text-on-green hover:bg-green-deep" : "border-edge bg-surface text-ink hover:bg-cream",
                )}
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {on ? <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" /> : <path d="M8 3 V13 M3 8 H13" />}
                </svg>
                {l.name}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function FollowPicker({ locations, following, onToggle }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Group title="Courses" items={locations.filter((l) => l.kind === "course")} following={following} onToggle={onToggle} />
      <Group title="Outdoor and covered ranges" items={locations.filter((l) => l.kind === "range")} following={following} onToggle={onToggle} />
    </div>
  );
}
