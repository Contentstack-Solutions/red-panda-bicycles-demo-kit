"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { signInMember } from "@/lib/clubSignIn";
import { SIGN_IN_REFRESH_MS, SIGN_IN_TIMEOUT_MS, TARGET_AUDIENCE } from "@/lib/demoMember";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Demo account chooser: one fixed member, no inputs. Continuing identifies the
// browser to Lytics, then returns with a full request so the server re-renders
// with the member's Personalize variants.
export default function ClubLogin({ member, returnTo }) {
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function continueAsMember() {
    if (started.current) return;
    started.current = true;
    setBusy(true);
    try {
      await signInMember({
        getJstag: () => window.jstag,
        member,
        audience: TARGET_AUDIENCE,
        timeoutMs: SIGN_IN_TIMEOUT_MS,
        refreshEveryMs: SIGN_IN_REFRESH_MS,
        getCookies: () => document.cookie,
        setCookie: (cookie) => {
          document.cookie = cookie;
        },
        hostname: window.location.hostname,
      });
    } finally {
      window.location.assign(returnTo);
    }
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center bg-cream px-4 py-16">
      <div className="w-full max-w-md border border-ink/10 bg-white p-8 sm:p-10">
        <h1 className="font-serif text-3xl font-semibold text-ink">Sign in with Google</h1>
        <p className="mt-2 text-ink-light">to continue to Amsterdam BC</p>

        <div className="mt-8 flex items-center gap-4 border border-ink/10 px-4 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white" aria-hidden="true">
            {member.firstName.charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">
              {member.firstName} {member.lastName}
            </span>
            <span className="block truncate text-sm text-ink-light">{member.email}</span>
          </span>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <Link href={returnTo} className="text-sm font-medium text-ink transition-colors hover:text-accent">
            Cancel
          </Link>
          <button
            type="button"
            onClick={continueAsMember}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center gap-2 bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark disabled:cursor-wait disabled:opacity-80"
          >
            {busy && <Spinner />}
            {busy ? "Signing you in…" : "Continue"}
          </button>
        </div>
      </div>
    </section>
  );
}
