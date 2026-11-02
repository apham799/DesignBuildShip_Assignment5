import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk reads the session on every request. Pages are open; the data is protected
// where it lives, by row-level security in Supabase: no signed-in token, no rows.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
