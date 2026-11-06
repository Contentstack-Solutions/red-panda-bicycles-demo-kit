"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContentstackClient, cslp } from "@/lib/contentstack-client";
import { resolvePageHref, slugify } from "@/utils/text";
import { useCart } from "@/context/cart.context";
import MemberMenu from "@/components/MemberMenu";
import DevToolsPanel from "./DevToolsPanel";

const LOCALES = ["en", "es", "fr", "de"];

function IconButton({ label, children, onClick, className = "" }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-cream-dark ${className}`}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6h15l-1.5 9h-12z" />
      <path d="M6 6 4.7 3H2" />
      <circle cx="9.5" cy="19.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="19.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICON_LINKS = [{ label: "Search", Icon: SearchIcon }];

function CartLink({ count, className = "", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Cart${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-cream-dark ${className}`}
    >
      <CartIcon />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function MenuIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

export default function Header({ locale = "en", initialData, member = null }) {
  const [entry, setEntry] = useState(initialData?.[0] ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const { totalCount, openDrawer } = useCart();

  useEffect(() => {
    const fetchData = async () => {
      const data = await ContentstackClient.getElementByTypeWithRefs("header", locale, ["menu_items.page"], initialData);
      setEntry(data?.[0] ?? null);
    };

    ContentstackClient.onEntryChange(fetchData);
  }, [locale, initialData]);

  const logo = entry?.logo;
  const menuItems = entry?.menu_items ?? [];

  const links = menuItems.map((item, index) => {
    const href = resolvePageHref(item.page, locale, slugify(item.text), item.external_link);
    const isExternal = !item.page?.[0]?.url && /^(https?:)?\/\//i.test(item.external_link || "");
    return { item, index, href, isExternal };
  });

  return (
    <header className="relative border-b border-ink/10 bg-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-8 sm:px-6">
        <Link href={`/${locale}`} className="flex shrink-0 items-center" {...entry?.$?.logo}>
          {logo?.url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logo.url}
              alt={logo.title || "Red Panda Bicycles"}
              width={logo.dimension?.width || 300}
              height={logo.dimension?.height || 62}
              className="h-9 w-auto sm:h-14"
            />
          )}
        </Link>

        <nav className="hidden lg:block">
          {menuItems.length === 0 && (
            <div className="visual-builder__empty-block-parent h-10 w-40" {...entry?.$?.menu_items} />
          )}
          <ul className="flex items-center gap-8" {...entry?.$?.menu_items}>
            {links.map(({ item, index, href, isExternal }) => (
              <li key={item._metadata?.uid || index} className="shrink-0" {...cslp(entry, "menu_items__", index)}>
                <Link
                  href={href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  className="whitespace-nowrap text-sm font-medium text-ink transition-colors hover:text-accent"
                  {...item?.$?.text}
                >
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <IconButton
            label={mobileOpen ? "Close menu" : "Open menu"}
            className="lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <MenuIcon open={mobileOpen} />
          </IconButton>
          {ICON_LINKS.map(({ label, Icon }) => (
            <IconButton key={label} label={label} className="hidden lg:flex">
              <Icon />
            </IconButton>
          ))}
          <CartLink count={totalCount} onClick={openDrawer} className="hidden lg:flex" />
          <IconButton label="Contentstack dev tools" onClick={() => setDevToolsOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </IconButton>
          <MemberMenu member={member} locale={locale} />

          <div className="relative ml-1 shrink-0 sm:ml-2">
            <select
              aria-label="Language"
              defaultValue={locale}
              className="cursor-pointer appearance-none border border-ink/15 bg-cream py-1.5 pl-2 pr-6 text-xs font-medium text-ink sm:py-2 sm:pl-3 sm:pr-8 sm:text-sm"
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink sm:right-3"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-ink/10 bg-cream lg:hidden">
          <ul className="mx-auto flex max-w-7xl flex-col divide-y divide-ink/10 px-6">
            {links.map(({ item, index, href, isExternal }) => (
              <li key={item._metadata?.uid || index} {...cslp(entry, "menu_items__", index)}>
                <Link
                  href={href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  className="block py-4 text-base font-medium text-ink transition-colors hover:text-accent"
                  onClick={() => setMobileOpen(false)}
                  {...item?.$?.text}
                >
                  {item.text}
                </Link>
              </li>
            ))}
            {ICON_LINKS.map(({ label, Icon }) => (
              <li key={label}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 py-4 text-base font-medium text-ink transition-colors hover:text-accent"
                >
                  <Icon />
                  {label}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-4 text-base font-medium text-ink transition-colors hover:text-accent"
                onClick={() => {
                  setMobileOpen(false);
                  openDrawer();
                }}
              >
                <CartIcon />
                Cart{totalCount > 0 ? ` (${totalCount})` : ""}
              </button>
            </li>
            <li>
              <MemberMenu member={member} locale={locale} variant="mobile" onNavigate={() => setMobileOpen(false)} />
            </li>
          </ul>
        </nav>
      )}

      <div
        onClick={() => setDevToolsOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/50 transition-opacity duration-300 ${
          devToolsOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <DevToolsPanel isOpen={devToolsOpen} onClose={() => setDevToolsOpen(false)} />
    </header>
  );
}
