import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

// Wrapped in Suspense: cacheComponents is on, and Clerk's catch-all pages read the request.
export default function SignInPage() {
  return (
    <div className="flex justify-center py-8">
      <Suspense>
        <SignIn />
      </Suspense>
    </div>
  );
}
