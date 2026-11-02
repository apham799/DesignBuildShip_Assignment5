import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { LoadingCard } from "@/components/ui";

// One live page for everyone. Signed out, it runs as a guest trial (follows kept
// in this tab); signed in, follows are saved to the account with RLS.
export default function Home() {
  return (
    <Suspense fallback={<LoadingCard label="Loading…" />}>
      <Dashboard />
    </Suspense>
  );
}
