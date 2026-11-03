"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearGuestFollows, clearImportedNotice, readGuestFollows, readImportedNotice, writeGuestFollows, writeImportedNotice } from "./guest-follows";
import type { Condition, DivvyRun, Location, NearbyStation, Station, StationStatus, WorkerRun } from "./types";

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
// Divvy rides along on the same channel (one socket per page), but loads on its
// own: if its queries fail, weather still shows and only the Divvy section says so.
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
  // Divvy: docks near each location, their live counts, and the Divvy worker clock.
  nearby: Record<string, NearbyStation[]>;
  stationStatus: Record<string, StationStatus>;
  divvyLatestRun: DivvyRun | null;
  divvyLastGoodRun: DivvyRun | null;
  divvyError: string | null;
  // Station ids that changed in the last few seconds.
  justChangedStations: Set<string>;
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
  nearby: {},
  stationStatus: {},
  divvyLatestRun: null,
  divvyLastGoodRun: null,
  divvyError: null,
  justChangedStations: new Set(),
};

const HIGHLIGHT_MS = 4000;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// One guest client for the life of the page. Creating a new one on every remount
// (sign-out, hot reload) made supabase-js warn about multiple auth clients.
let guestClient: SupabaseClient | null = null;
const getGuestClient = () => (guestClient ??= createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } }));

export function useLiveConditions() {
  const { isLoaded, userId } = useAuth();
  const clerk = useClerk();
  const guest = isLoaded && !userId;
  const [state, setState] = useState<LiveState>(EMPTY);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [followError, setFollowError] = useState<string | null>(null);
  // How many guest follows were just copied into the account, for a confirmation.
  const [imported, setImported] = useState<number | null>(null);
  const clearImported = useCallback(() => {
    clearImportedNotice();
    setImported(null);
  }, []);
  const clearFollowError = useCallback(() => setFollowError(null), []);

  // One client per person (or one for guests), so nothing carries over after a
  // switch. Signed in, it asks Clerk for the current session token on every request
  // and Realtime heartbeat; Clerk refreshes the short-lived token itself.
  const db: SupabaseClient = useMemo(
    () => (userId ? createClient(URL_, KEY, { accessToken: async () => (await clerk.session?.getToken()) ?? null }) : getGuestClient()),
    [clerk, userId],
  );

  // Highlight a changed card (or dock) briefly, then let it fade.
  const flash = useCallback((key: "justChanged" | "justChangedStations", ids: string[]) => {
    setState((s) => ({ ...s, [key]: new Set([...s[key], ...ids]) }));
    setTimeout(() => {
      setState((s) => {
        const next = new Set(s[key]);
        ids.forEach((id) => next.delete(id));
        return { ...s, [key]: next };
      });
    }, HIGHLIGHT_MS);
  }, []);

  const loadDivvy = useCallback(async () => {
    const [links, status, latest, lastGood] = await Promise.all([
      db.from("location_stations").select("location_id, distance_m, rank, stations(id, name, capacity)").order("rank"),
      db.from("station_status").select("*"),
      db.from("divvy_runs").select("*").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("divvy_runs").select("*").eq("ok", true).order("ran_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failed = links.error ?? status.error ?? latest.error ?? lastGood.error;
    if (failed) {
      setState((s) => ({ ...s, divvyError: failed.message }));
      return;
    }
    const nearby: Record<string, NearbyStation[]> = {};
    for (const l of links.data as unknown as { location_id: string; distance_m: number; rank: number; stations: Station }[]) {
      (nearby[l.location_id] ??= []).push({ station: l.stations, distance_m: l.distance_m, rank: l.rank });
    }
    setState((s) => ({
      ...s,
      divvyError: null,
      nearby,
      stationStatus: Object.fromEntries((status.data as StationStatus[]).map((r) => [r.station_id, r])),
      divvyLatestRun: latest.data as DivvyRun | null,
      divvyLastGoodRun: lastGood.data as DivvyRun | null,
    }));
  }, [db]);

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
    writeImportedNotice(ids.length);
  }, [db]);

  const load = useCallback(async () => {
    loadDivvy();
    if (userId) {
      await importGuestFollows();
      setImported(readImportedNotice());
    }
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
  }, [db, userId, importGuestFollows, loadDivvy]);

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
        flash("justChanged", [row.location_id]);
      })
      // The worker ran: this is the worker clock, and how the page learns it's down.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
        const run = payload.new as WorkerRun;
        setState((s) => ({ ...s, latestRun: run, lastGoodRun: run.ok ? run : s.lastGoodRun }));
      })
      // A dock's counts changed (poll-divvy only writes docks whose counts moved).
      .on("postgres_changes", { event: "*", schema: "public", table: "station_status" }, (payload) => {
        const row = payload.new as StationStatus;
        if (!row?.station_id) return;
        setState((s) => ({ ...s, stationStatus: { ...s.stationStatus, [row.station_id]: row } }));
        flash("justChangedStations", [row.station_id]);
      })
      // The Divvy worker ran: its own clock, independent of the weather worker's.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "divvy_runs" }, (payload) => {
        const run = payload.new as DivvyRun;
        setState((s) => ({ ...s, divvyLatestRun: run, divvyLastGoodRun: run.ok ? run : s.divvyLastGoodRun }));
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
