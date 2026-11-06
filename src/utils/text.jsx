import { Fragment } from "react";

// Renders CMS copy that may contain literal newlines (multi-line headlines)
// and colors a trailing ./!/? in accent color, e.g. "Bikes for\nBrighter\nDays."
//
// Both helpers below return an array of nodes rather than a single string, so React
// reconciles the host element's children one by one. In the Visual Builder that
// element is contenteditable, and the editor replaces or clears the very text nodes
// React is tracking - React then calls removeChild on a node that is no longer there
// and the page dies with "NotFoundError: ... not a child of this node". Callers must
// therefore key the element carrying the `$` (data-cslp) tag on the text itself, so a
// change remounts the element instead of patching children React no longer owns.
export function renderAccentText(text) {
  if (!text) return null;
  const lines = text.split("\n");

  return lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const match = isLast ? line.match(/([.!?])$/) : null;
    const base = match ? line.slice(0, -1) : line;

    return (
      <Fragment key={index}>
        {base}
        {match && <span className="text-accent">{match[1]}</span>}
        {!isLast && <br />}
      </Fragment>
    );
  });
}

// Renders CMS copy with literal newlines as <br/>-separated lines, with no
// accent styling - for body copy rather than headlines.
export function renderMultilineText(text) {
  if (!text) return null;
  const lines = text.split("\n");

  return lines.map((line, index) => (
    <Fragment key={index}>
      {line}
      {index !== lines.length - 1 && <br />}
    </Fragment>
  ));
}

// Strips HTML tags from commerce-platform copy (e.g. a category's resolved
// description), which arrives as an HTML string rather than CMS rich text.
export function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

export function slugify(text) {
  return `/${(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

// Resolves a Contentstack reference field (an array with a resolved `url`)
// to a locale-prefixed href. When the reference is unset, falls back to an
// external_link field before falling back to a slug. external_link may hold
// either a full off-site URL (used as-is) or a relative in-site path (still
// gets the locale prefix).
export function resolvePageHref(pageRef, locale, fallback, externalLink) {
  const url = pageRef?.[0]?.url;
  if (url) return `/${locale}${url}`;
  if (externalLink) {
    return /^(https?:)?\/\//i.test(externalLink) ? externalLink : `/${locale}${externalLink}`;
  }
  return `/${locale}${fallback}`;
}
