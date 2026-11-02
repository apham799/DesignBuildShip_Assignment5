"use client";

import { ConditionCard } from "@/components/condition-card";
import { FollowPicker } from "@/components/follow-picker";
import { FreshnessBanner } from "@/components/freshness-banner";
import { Alert, Button, ButtonLink, Card, LoadingCard } from "@/components/ui";
import { freshness } from "@/lib/freshness";
import { useLiveConditions, useNow } from "@/lib/use-live-conditions";

// The page for everyone: how fresh things are, the places you follow (live), and
// where to change what you follow. Guests get the same live page as a trial, with
// their follows kept in this tab and a nudge to make an account to keep them.

function GuestNudge() {
  return (
    <Card tone="cream" as="section" labelledBy="guest-title" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 id="guest-title" className="text-heading">
          You&apos;re trying it as a guest
        </h2>
        <p className="max-w-2xl text-body">
          Everything here is live. The places you follow are saved in this tab only. Create a free account to keep them; they come with you.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">
        <ButtonLink href="/sign-up">Create a free account</ButtonLink>
        <ButtonLink href="/sign-in" variant="secondary">
          Sign in
        </ButtonLink>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const live = useLiveConditions();
  const now = useNow();

  const followed = live.locations.filter((l) => live.following.has(l.id));
  // The newest reading among the places you follow (or any, before you follow one).
  const ids = followed.length ? followed.map((l) => l.id) : Object.keys(live.conditions);
  const readingAt =
    ids
      .map((id) => live.conditions[id]?.observed_at)
      .filter((t): t is string => Boolean(t))
      .sort()
      .at(-1) ?? null;

  const f = freshness({
    loaded: live.loaded && !live.loadError,
    latestRun: live.latestRun,
    lastGoodRunAt: live.lastGoodRun?.ran_at ?? null,
    readingAt,
    now,
  });

  if (live.loadError) {
    return (
      <Alert tone="error" title="Couldn't load live conditions" action={<Button onClick={live.retry}>Try again</Button>}>
        Check your connection. If it keeps happening, sign out and back in.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-display">Can I play right now?</h1>
        <p className="max-w-2xl text-body text-muted">
          Live conditions at the Chicago courses and ranges you follow. This page updates on its own; no need to refresh.
        </p>
      </div>

      {live.guest && <GuestNudge />}

      <FreshnessBanner freshness={f} status={live.status} latestRun={live.latestRun} lastGoodRun={live.lastGoodRun} readingAt={readingAt} now={now} />

      {live.followError && <Alert tone="error" title={live.followError} onDismiss={live.clearFollowError} />}
      {live.imported && (
        <div role="status">
          <Alert
            tone="success"
            title={`Added the ${live.imported} ${live.imported === 1 ? "place" : "places"} you followed as a guest to your account`}
            onDismiss={live.clearImported}
          >
            They&apos;re saved now, so they&apos;ll be here next time you sign in, on any device.
          </Alert>
        </div>
      )}

      {!live.loaded ? (
        <LoadingCard label="Loading the places you follow…" />
      ) : followed.length === 0 ? (
        <Card tone="cream" as="section" labelledBy="pick-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="pick-title" className="text-heading">
              Pick the places you play
            </h2>
            <p className="text-body">
              Follow a course or range and its conditions show up here, live. You can change this any time
              {live.guest ? "; as a guest, your picks stay in this tab." : "."}
            </p>
          </div>
          <FollowPicker locations={live.locations} following={live.following} onToggle={live.toggleFollow} />
        </Card>
      ) : (
        <>
          <section aria-labelledby="following-title" className="flex flex-col gap-4">
            <h2 id="following-title" className="text-heading">
              You follow {followed.length} {followed.length === 1 ? "place" : "places"}
            </h2>
            <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {followed.map((l) => (
                <ConditionCard
                  key={l.id}
                  location={l}
                  condition={live.conditions[l.id]}
                  justChanged={live.justChanged.has(l.id)}
                  now={now}
                  onUnfollow={() => live.toggleFollow(l.id)}
                />
              ))}
            </ul>
          </section>

          <details className="rounded-lg border border-rule p-5">
            <summary className="cursor-pointer text-body font-semibold text-green marker:text-green">Follow more places</summary>
            <div className="mt-4">
              <FollowPicker locations={live.locations} following={live.following} onToggle={live.toggleFollow} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
