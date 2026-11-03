// The Divvy worker: a Supabase Edge Function that Supabase Cron calls every minute
// (supabase/migrations/*_schedule_divvy.sql). Same shape as poll-conditions:
// withSupabase({ auth: "secret" }) only lets in callers with the project's secret
// key, and ctx.supabaseAdmin uses that key on Supabase's servers. verify_jwt is off
// in config.toml because Cron sends a key, not a user's token.

import { withSupabase } from "npm:@supabase/server@1";
import { fetchJson, runOnce, type StationRow, type Store } from "./worker.ts";

// deno-lint-ignore no-explicit-any
function supabaseStore(db: any): Store {
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };
  return {
    loadStationIds: async () =>
      (check(await db.from("stations").select("id").order("id"), "load stations") as { id: string }[]).map((s) => s.id),
    loadStatus: async () => check(await db.from("station_status").select("*"), "load station status") as StationRow[],
    upsertStatus: async (rows) => {
      const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      check(await db.from("station_status").upsert(stamped, { onConflict: "station_id" }), "upsert station status");
    },
    recordRun: async (run) => {
      check(await db.from("divvy_runs").insert(run), "record run");
    },
  };
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req: Request, ctx: { supabaseAdmin: unknown }) => {
    const run = await runOnce(supabaseStore(ctx.supabaseAdmin), fetchJson);
    return Response.json(run, { status: run.ok ? 200 : 502 });
  }),
};
