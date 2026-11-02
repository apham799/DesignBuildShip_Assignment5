// The worker: a Supabase Edge Function that Supabase Cron calls every 2 minutes
// (supabase/migrations/*_schedule_worker.sql).
//
// withSupabase({ auth: "secret" }) only lets in callers that send the project's
// secret key on the apikey header (Cron does, from Vault), and hands us
// ctx.supabaseAdmin, a client that uses that key on Supabase's servers. The key
// never appears in this code or the repo. verify_jwt is off in config.toml
// because the caller sends a key, not a user's token.

import { withSupabase } from "npm:@supabase/server@1";
import { fetchJson, runOnce, type ConditionRow, type Location, type Store } from "./worker.ts";

// deno-lint-ignore no-explicit-any
function supabaseStore(db: any): Store {
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };
  return {
    loadLocations: async () =>
      check(await db.from("locations").select("id, lat, lon").order("sort"), "load locations") as Location[],
    loadConditions: async () =>
      check(await db.from("conditions").select("*"), "load conditions") as ConditionRow[],
    upsertConditions: async (rows) => {
      // updated_at is set here, not in the comparison, so unchanged rows are never touched.
      const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      check(await db.from("conditions").upsert(stamped, { onConflict: "location_id" }), "upsert conditions");
    },
    recordRun: async (run) => {
      check(await db.from("worker_runs").insert(run), "record run");
    },
  };
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req: Request, ctx: { supabaseAdmin: unknown }) => {
    const run = await runOnce(supabaseStore(ctx.supabaseAdmin), fetchJson);
    return Response.json(run, { status: run.ok ? 200 : 502 });
  }),
};
