"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContentstackClient, cslp } from "@/lib/contentstack-client";
import { resolvePageHref, slugify } from "@/utils/text";

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Cookies", href: "/cookies" },
];

function SocialIcon({ label, children }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center text-cream transition-colors hover:text-accent"
    >
      {children}
    </a>
  );
}

export default function Footer({ locale = "en", initialData }) {
  const [entry, setEntry] = useState(initialData?.[0] ?? null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await ContentstackClient.getElementByTypeWithRefs("footer", locale, ["link_columns.column.page"], initialData);
      setEntry(data?.[0] ?? null);
    };

    ContentstackClient.onEntryChange(fetchData);
  }, [locale, initialData]);

  const linkColumns = entry?.link_columns ?? [];

  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div className="col-span-2 md:col-span-1">
            <p className="font-serif text-2xl font-semibold text-white" {...entry?.$?.name}>
              {entry?.name}
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-cream/50" {...entry?.$?.tagline}>
              {entry?.tagline}
            </p>
          </div>

          {linkColumns.length === 0 && (
            <div className="visual-builder__empty-block-parent col-span-2 h-20" {...entry?.$?.link_columns} />
          )}
          <div className="contents" {...entry?.$?.link_columns}>
            {linkColumns.map((column, columnIndex) => (
              <nav key={column._metadata?.uid || columnIndex} {...cslp(entry, "link_columns__", columnIndex)}>
                {(column.column ?? []).length === 0 && (
                  <div className="visual-builder__empty-block-parent h-20" {...column?.$?.column} />
                )}
                <ul className="space-y-3 text-sm" {...column?.$?.column}>
                  {(column.column ?? []).map((link, linkIndex) => (
                    <li key={link._metadata?.uid || linkIndex} {...cslp(column, "column__", linkIndex)}>
                      <Link
                        href={resolvePageHref(link.page, locale, slugify(link.text))}
                        className="text-cream/80 transition-colors hover:text-white"
                        {...link?.$?.text}
                      >
                        {link.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="col-span-2 md:col-span-1">
            <p className="text-sm font-semibold text-white" {...entry?.$?.social_label}>
              {entry?.social_label}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <SocialIcon label="Instagram">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
                </svg>
              </SocialIcon>
              <SocialIcon label="Facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M14 8.5h2.5V5H14c-2 0-3.5 1.5-3.5 3.5V11H8v3h2.5v6H14v-6h2.3l.7-3H14V8.7c0-.1.1-.2.3-.2Z" strokeLinejoin="round" />
                </svg>
              </SocialIcon>
              <SocialIcon label="YouTube">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="3" y="6" width="18" height="12" rx="3" />
                  <path d="M11 9.8v4.4l4-2.2Z" fill="currentColor" stroke="none" />
                </svg>
              </SocialIcon>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-cream/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 text-xs text-cream/50 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} {entry?.name || "Red Panda Bicycles"}. All rights reserved.</p>
          <div className="flex gap-6">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={`/${locale}${link.href}`}
                className="transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
