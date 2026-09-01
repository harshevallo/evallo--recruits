import { useEffect } from 'react';

/**
 * Per-page `<title>`, description, canonical and Open Graph tags.
 *
 * ── The rendering constraint, stated honestly ─────────────────────────────────────────────────
 *
 * `index.html` carried a comment claiming *"Per-page metadata (canonical, Open Graph, JSON-LD) is
 * injected server-side for public routes"*. **It was not, and is not.** This is a Vite SPA served
 * as static files by Vercel; there is no SSR, no prerender step, and no edge function rewriting
 * the document. Every public page shipped the same title and no canonical at all.
 *
 * So these tags are written by JavaScript, after hydration. What that does and does not buy:
 *
 *   · **Googlebot renders JavaScript** and will see all of it — title, description, canonical.
 *     This is the case that matters for search, and it works.
 *   · **Most social crawlers do not.** WhatsApp, Slack, LinkedIn and Facebook fetch the raw HTML
 *     and never execute the bundle, so a shared link still previews with the generic site card
 *     from `index.html`. Client-side tags cannot fix that — only server-rendered HTML can.
 *
 * That limitation is recorded rather than papered over. The fix is prerendering or an edge
 * function that injects tags for `/companies/:slug` and `/roles/:roleId`, which is a deployment
 * change rather than an application one and was explicitly out of scope here.
 *
 * ── Why a hook and not a library ──────────────────────────────────────────────────────────────
 *
 * `react-helmet-async` would do this, and would be a dependency plus a provider for four pages
 * that each set six tags. `SharedPortfolioPage` had already hand-rolled the same `setMetaTag`
 * helper; this is that helper promoted to one place rather than a second copy of it.
 */

/**
 * The origin canonical URLs are built from.
 *
 * `VITE_PUBLIC_SITE_URL` when set, because the app is reachable on more than one host — the
 * custom domain and the Vercel deployment URL — and a canonical that echoes whichever host the
 * reader happened to use tells a crawler the duplicates are all originals. `window.location.origin`
 * is the fallback so local development and previews still produce something coherent.
 */
export function siteOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** Absolute URL for a path, on the canonical origin. */
export function canonicalUrl(path) {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Sets a `<meta>` by name or property, creating it if absent. Returns a cleanup. */
function setMetaTag(attribute, key, content) {
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
  const created = !tag;

  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }

  const previous = tag.getAttribute('content');
  tag.setAttribute('content', content);

  return () => {
    if (created) tag.remove();
    else if (previous !== null) tag.setAttribute('content', previous);
  };
}

/** Sets `<link rel="canonical">`. Returns a cleanup. */
function setCanonical(href) {
  let tag = document.head.querySelector('link[rel="canonical"]');
  const created = !tag;

  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', 'canonical');
    document.head.appendChild(tag);
  }

  const previous = tag.getAttribute('href');
  tag.setAttribute('href', href);

  return () => {
    if (created) tag.remove();
    else if (previous !== null) tag.setAttribute('href', previous);
  };
}

/** Collapses whitespace and truncates on a word boundary, so a description never ends mid-word. */
export function clampDescription(text, max = 160) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\-\s]+$/, '')}…`;
}

/**
 * Applies page metadata for as long as the component is mounted, restoring the previous values on
 * unmount so a client-side navigation never leaves another page's title behind.
 *
 * Pass `null`/`undefined` while data is still loading — nothing is written, so the document keeps
 * the generic defaults from `index.html` rather than flashing a half-built title. That is also the
 * safe fallback when a company or role could not be fetched at all.
 *
 * @param {object|null} meta
 * @param {string}  meta.title
 * @param {string}  [meta.description]
 * @param {string}  [meta.path]        canonical path, e.g. `/companies/acme`
 * @param {string}  [meta.ogType]      defaults to `website`
 * @param {string}  [meta.image]       absolute URL; omitted when absent rather than faked
 * @param {string}  [meta.robots]      e.g. `noindex, nofollow`
 */
export function usePageMeta(meta) {
  /* Primitives in the dependency list, so an inline object literal does not re-run every render. */
  const { title, description, path, ogType = 'website', image, robots } = meta ?? {};

  useEffect(() => {
    if (!title) return undefined;

    const url = path ? canonicalUrl(path) : undefined;
    const undo = [];

    const previousTitle = document.title;
    document.title = title;

    if (description) {
      undo.push(setMetaTag('name', 'description', description));
      undo.push(setMetaTag('property', 'og:description', description));
    }

    undo.push(setMetaTag('property', 'og:title', title));
    undo.push(setMetaTag('property', 'og:type', ogType));
    undo.push(setMetaTag('property', 'og:site_name', 'Evallo Recruit'));

    /* Large summary card only when there is a real image to fill it. */
    undo.push(setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary'));

    if (url) {
      undo.push(setCanonical(url));
      undo.push(setMetaTag('property', 'og:url', url));
    }

    /* Only a real image. A placeholder would be a worse card than no card. */
    if (image) undo.push(setMetaTag('property', 'og:image', image));

    if (robots) undo.push(setMetaTag('name', 'robots', robots));

    return () => {
      document.title = previousTitle;
      undo.forEach((restore) => restore());
    };
  }, [title, description, path, ogType, image, robots]);
}
