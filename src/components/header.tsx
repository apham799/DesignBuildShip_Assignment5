"use client";

// A client component on purpose: the layout (and so the header) is rendered once and
// kept across in-app navigation, so a server-rendered header would keep showing
// "Sign in" after Clerk signs you in and sends you back. Here, Show re-renders as
// soon as the sign-in state changes.
import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-cream-deep bg-cream">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-12">
        <Link href="/" className="flex items-center gap-2 rounded-sm font-display text-xl font-semibold text-green">
          <svg viewBox="0 0 16 16" className="size-5 text-brass" aria-hidden fill="currentColor">
            <rect x="4" y="2" width="1.5" height="12" />
            <path d="M5.5 2.5 L12 5 L5.5 7.5 Z" />
          </svg>
          Can I Play?
        </Link>
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <ButtonLink href="/sign-in" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/sign-up" size="sm">
              Sign up
            </ButtonLink>
          </Show>
          <UserButton />
        </div>
      </div>
    </header>
  );
}
