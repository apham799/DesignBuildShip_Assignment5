import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

// Wrapped in Suspense: cacheComponents is on, and Clerk's catch-all pages read the request.
export default function SignUpPage() {
  return (
    <div className="flex justify-center py-8">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
