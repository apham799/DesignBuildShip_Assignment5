import { ButtonLink, Card, Ornament } from "@/components/ui";

// Signed out: what this is, and a way in. It shows no live data: conditions are
// only readable with a signed-in token (RLS).

const points = [
  ["Live", "Checked every 2 minutes, with new readings every 15, straight to your screen. No refreshing."],
  ["Yours", "Follow just the courses and ranges you play. Only you see your list."],
  ["Honest", "Every card says how old its reading is, and the page tells you when it's out of date."],
];

export function Landing() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-6">
      <div className="flex flex-col gap-3">
        <p className="text-label text-muted">From the makers of Bucket List</p>
        <h1 className="text-display">Can I play right now?</h1>
        <p className="text-body">
          Live wind, rain, temperature and daylight at Chicago&apos;s public courses and ranges, with a plain answer: go play, playable with a
          caveat, or not now. Follow the places you play and watch them update on their own.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/sign-up" size="lg">
            Create a free account
          </ButtonLink>
          <ButtonLink href="/sign-in" variant="secondary" size="lg">
            Sign in
          </ButtonLink>
        </div>
      </div>
      <Ornament />
      <ul className="grid gap-4 sm:grid-cols-3">
        {points.map(([title, body]) => (
          <Card as="li" key={title} className="flex flex-col gap-1">
            <h2 className="text-heading">{title}</h2>
            <p className="text-body">{body}</p>
          </Card>
        ))}
      </ul>
    </div>
  );
}
