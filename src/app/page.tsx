import { Show } from "@clerk/nextjs";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/landing";
import { LoadingCard } from "@/components/ui";

// Signed out: what this is. Signed in: your live conditions.
export default function Home() {
  return (
    <Suspense fallback={<LoadingCard label="Loading…" />}>
      <Show when="signed-out">
        <Landing />
      </Show>
      <Show when="signed-in">
        <Dashboard />
      </Show>
    </Suspense>
  );
}
