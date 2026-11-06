"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOutCookieStrings } from "@/lib/memberSession";

// Clears the member, Lytics and Personalize cookies so the browser becomes a
// brand-new anonymous visitor, then reloads the current page from the server.
function signOut() {
  for (const cookie of signOutCookieStrings(window.location.hostname)) {
    document.cookie = cookie;
  }
  window.location.assign(window.location.pathname);
}

export default function MemberMenu({ member, locale, variant = "desktop", onNavigate }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const loginHref = `/${locale}/login?returnTo=${encodeURIComponent(pathname || `/${locale}`)}`;
  const rowClass = "flex w-full items-center gap-3 py-4 text-base font-medium text-ink transition-colors hover:text-accent";

  if (variant === "mobile") {
    if (!member) {
      return (
        <Link href={loginHref} onClick={onNavigate} className={rowClass}>
          Log into Amsterdam BC
        </Link>
      );
    }
    return (
      <button type="button" onClick={signOut} className={rowClass}>
        Hi, {member.firstName} · Sign out
      </button>
    );
  }

  if (!member) {
    return (
      <Link
        href={loginHref}
        className="ml-1 hidden whitespace-nowrap border border-ink/15 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent lg:inline-flex"
      >
        Log into Amsterdam BC
      </Link>
    );
  }

  return (
    <div className="relative ml-1 hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="whitespace-nowrap border border-ink/15 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
      >
        Hi, {member.firstName}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 min-w-40 border border-ink/10 bg-white py-1 shadow-sm">
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="block w-full px-4 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-cream-dark"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
