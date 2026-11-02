"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearGuestFollows, readGuestFollows, writeGuestFollows } from "./guest-follows";
import type { Condition, Location, WorkerRun } from "./types";

// Everything the dashboard shows, kept live, for guests and signed-in golfers.
//
// Signed in: every request and the Realtime socket carry the Clerk session token,
// so Supabase applies row-level security: follows come back for this person only.
// The app never sends user_id; the database fills it in from the token.
//
// Guest: the publishable key only (the anon role), which can read the public live
// data and nothing else. Follows live in this tab (guest-follows.ts) and are copied
// into the account on sign-in.
//
// Order matters: subscribe first, then load. Each time the channel (re)connects,
// we load a fresh snapshot, so nothing that changed while we were disconnected
// (asleep laptop, dropped wifi) is missed.

export type RealtimeStatus = "connecting" | "live" | "reconnecting";

type LiveState = {
  loaded: boolean;
  loadError: string | null;
  locations: Location[];
  conditions: Record<string, Condition>;
  following: Set<string>;
  latestRun: WorkerRun | null;
  lastGoodRun: WorkerRun | null;
  // Location ids that changed in the last few seconds, for a brief highlight.
  justChanged: Set<string>;
};

const EMPTY: LiveState = {
  loaded: false,
  loadError: null,
  locations: [],
  conditions: {},
  following: new Set(),
  latestRun: null,
  lastGoodRun: null,
  justChanged: new Set(),
};

const HIGHLIGHT_MS = 4000;

export function useLiveConditions() {
  const { isLoaded, userId } = useAuth();
  const clerk = useClerk();
  const guest = isLoaded && !userId;
  const [state, setState] = useState<LiveState>(EMPTY);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [followError, setFollowError] = useState<string | null>(null);
  // How many guest follows were just copied into the account, for a confirmation.
  const [imported, setImported] = useState<number | null>(null);
  const clearImported = useCallback(() => setImported(null), []);
  const clearFollowError = useCallback(() => setFollowError(null), []);

  // One client per person (or one for guests), so nothing carries over after a
  // switch. Signed in, it asks Clerk for the current session token on every request
  // and Realtime heartbeat; Clerk refreshes the short-lived token itself.
  const db: SupabaseClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    return userId
      ? createClient(url, key, { accessToken: async () => (await clerk.session?.getToken()) ?? null })
      : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }, [clerk, userId]);

  const flash = useCallback((ids: string[]) => {
    setState((s) => ({ ...s, justChanged: new Set([...s.justChanged, ...ids]) }));
    setTimeout(() => {
      setState((s) => {
        const next = new Set(s.justChanged);
        ids.forEach((id) => next.delete(id));
        return { ...s, justChanged: next };
      });
    }, HIGHLIGHT_MS);
  }, []);

  // Signed in: first copy any follows made as a guest in this tab into the account.
  // Already-followed places are skipped, not duplicated. If the copy fails, the
  // guest list is kept and tried again on the next load.
  const importGuestFollows = useCallback(async () => {
    const ids = readGuestFollows();
    if (!ids.length) return;
    const { error } = await db
      .from("follows")
      .upsert(ids.map((location_id) => ({ location_id })), { onConflict: "user_id,location_id", ignoreDuplicates: true });
    if (error) {
      setFollowError("Couldn't add the places you followed as a guest to your account. We'll try again.");
      return;
    }
    clearGuestFollows();
    setImported(ids.length);
  }, [db]);

  const load = useCallback(async () => {
    if (userId) await importGuestFollows();
    const followsQuery = userId
      ? db.from("follows").select("location_id")
      : Promise.resolve({ data: readGuestFollows().map((location_id) => ({ location_id })), error: null });
    const [locations, conditions, follows, latest, lastGood] = await Promise.all([
      db.from("locations").select("id, name, kind, area, sort").order("sort"),
      db.from("conditions").select("*"),
      followsQuery,
      db.from("worker_runs").select("*").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("worker_runs").select("*").eq("ok", true).order("ran_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failed = locations.error ?? conditions.error ?? follows.error ?? latest.error ?? lastGood.error;
    if (failed) {
      setState((s) => ({ ...s, loaded: true, loadError: failed.message }));
      return;
    }
    setState((s) => ({
      ...s,
      loaded: true,
      loadError: null,
      locations: locations.data as Location[],
      conditions: Object.fromEntries((conditions.data as Condition[]).map((c) => [c.location_id, c])),
      following: new Set((follows.data as { location_id: string }[]).map((f) => f.location_id)),
      latestRun: latest.data as WorkerRun | null,
      lastGoodRun: lastGood.data as WorkerRun | null,
    }));
  }, [db, userId, importGuestFollows]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    const channel = db
      .channel("live-conditions")
      // A reading changed (the worker only writes rows that changed).
      .on("postgres_changes", { event: "*", schema: "public", table: "conditions" }, (payload) => {
        const row = payload.new as Condition;
        if (!row?.location_id) return;
        setState((s) => ({ ...s, conditions: { ...s.conditions, [row.location_id]: row } }));
        flash([row.location_id]);
      })
      // The worker ran: this is the worker clock, and how the page learns it's down.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
        const run = payload.new as WorkerRun;
        setState((s) => ({ ...s, latestRun: run, lastGoodRun: run.ok ? run : s.lastGoodRun }));
      })
      .subscribe((s) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") {
          setStatus("live");
          load();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("reconnecting");
        }
      });

    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [db, isLoaded, load, flash]);

  // Follow or unfollow, shown at once and undone if the save fails.
  const toggleFollow = useCallback(
    async (locationId: string) => {
      setFollowError(null);
      const wasFollowing = state.following.has(locationId);
      const apply = (follow: boolean) =>
        setState((s) => {
          const next = new Set(s.following);
          if (follow) next.add(locationId);
          else next.delete(locationId);
          return { ...s, following: next };
        });

      apply(!wasFollowing);
      if (!userId) {
        // Guest: this tab only.
        const next = new Set(state.following);
        if (wasFollowing) next.delete(locationId);
        else next.add(locationId);
        writeGuestFollows(next);
        return;
      }
      const { error } = wasFollowing
        ? await db.from("follows").delete().eq("location_id", locationId)
        : await db.from("follows").insert({ location_id: locationId });
      if (error) {
        apply(wasFollowing);
        const name = state.locations.find((l) => l.id === locationId)?.name ?? "that location";
        setFollowError(`Couldn't ${wasFollowing ? "unfollow" : "follow"} ${name}. Check your connection and try again.`);
      }
    },
    [db, userId, state.following, state.locations],
  );

  return {
    ...state,
    guest,
    status,
    toggleFollow,
    followError,
    clearFollowError,
    imported,
    clearImported,
    retry: load,
  };
}

// Re-renders on an interval, so "3 min ago" counts up and the page turns stale on
// its own when the worker stops sending anything.
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
