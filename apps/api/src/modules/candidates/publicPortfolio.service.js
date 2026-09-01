/**
 * The public candidate portfolio — the read path for `CANDIDATE_VISIBILITY.PUBLIC`.
 *
 * ── How this differs from the share link (ADR-019) ────────────────────────────────────────────
 *
 * Both are unauthenticated; they are otherwise opposites, and the difference is the reason this is
 * a separate file rather than a branch inside `share.service.js`:
 *
 *                        share link                    public portfolio
 *   address              a 256-bit secret              a stable, printable slug
 *   who may read         whoever holds the URL         anyone
 *   revocation           rotate the token, link dies   change status, page 404s
 *   states allowed       private / discoverable /      **public only**
 *                        paused
 *   contact              may be revealed under         **never, under any setting**
 *                        `authorized_recruiters`
 *
 * That last row is the one that matters most. A share link is something a candidate sends to a
 * named person; the public page is something search engines read. Merging them would put two
 * opposite security models behind one code path, where a single mistake exposes both.
 *
 * ── The visibility rule ───────────────────────────────────────────────────────────────────────
 *
 * Exactly `public`, from `PUBLICLY_READABLE_VISIBILITY_STATES`. Not "not private", not "published"
 * — an allow-list of one, so a future sixth state cannot arrive here by resembling this one.
 * `discoverable` is explicitly NOT enough: those candidates agreed to authenticated recruiters.
 */

import { PUBLICLY_READABLE_VISIBILITY_STATES } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { CandidateProfile } from './candidateProfile.model.js';
import { User } from '../users/user.model.js';
import { loadPortfolio, PORTFOLIO_AUDIENCE } from './portfolio.service.js';

/** Turns a display name into a URL-safe slug. Mirrors the company slug rules. */
export function slugifyName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * A slug not already taken.
 *
 * Suffixes rather than appending anything derived from the candidate: `-2` says nothing about the
 * person, where a fragment of an id or an email would.
 */
export async function uniquePublicSlug(base) {
  const root = base || 'educator';
  let candidate = root;
  let suffix = 1;

  /* Sequential by necessity: each probe depends on the previous answer. */
  while (await CandidateProfile.exists({ publicSlug: candidate })) {
    suffix += 1;
    candidate = `${root}-${suffix}`.slice(0, 60);
  }

  return candidate;
}

/**
 * Assigns a public slug if the profile has none, and returns it.
 *
 * Idempotent, and deliberately NOT called on read: a slug is minted when a candidate opts in, so
 * a profile that has never been public never acquires an address. The frontend phase will call
 * this from the visibility endpoint; it is exported here so that phase adds no new logic.
 */
export async function ensurePublicSlug(profile, displayName) {
  if (profile.publicSlug) return profile.publicSlug;

  const slug = await uniquePublicSlug(slugifyName(displayName));
  profile.publicSlug = slug;
  await profile.save();
  return slug;
}

/**
 * Resolves one public portfolio by slug.
 *
 * Every refusal is the same 404 with the same message. A distinct "this candidate exists but is
 * private" would turn the endpoint into an oracle: try a slug, learn whether that person is on
 * Evallo and whether they have chosen to hide. The only honest answer to an anonymous stranger is
 * that there is nothing at this address.
 *
 * @param {string} slug
 * @returns {Promise<{ profile: object, meta: object }>}
 */
export async function resolvePublicPortfolio(slug) {
  const notFound = () => ApiError.notFound('No public portfolio at that address.');

  const normalised = String(slug ?? '').trim().toLowerCase();
  if (!normalised) throw notFound();

  const profile = await CandidateProfile.findOne({ publicSlug: normalised });
  if (!profile) throw notFound();

  /* The allow-list. `discoverable`, `paused`, `private`, `draft` and `archived` all end here. */
  if (!PUBLICLY_READABLE_VISIBILITY_STATES.includes(profile.status)) throw notFound();

  const user = await User.findById(profile.userId).select('name profilePicture location languages');
  if (!user) throw notFound();

  const portfolio = await loadPortfolio(profile, { audience: PORTFOLIO_AUDIENCE.PUBLIC });

  return {
    /*
     * `toPublicView` takes no email argument, so contact cannot be passed in by a later edit.
     * `location` is handed over whole and narrowed there — city is dropped in one place.
     */
    profile: profile.toPublicView(
      {
        name: user.name ?? null,
        photoUrl: user.profilePicture ?? null,
        location: user.location ?? null,
        languages: user.languages ?? [],
      },
      portfolio,
    ),

    /**
     * What the page needs to render itself, and nothing that identifies the candidate further.
     *
     * No id, no user id, no email, no visibility state. `indexable` is reported as `false` for
     * now: this phase is the backend foundation only, and search-engine indexing is a separate
     * decision with its own consent copy. The field exists so the SEO phase flips a value rather
     * than inventing a contract.
     */
    meta: {
      slug: profile.publicSlug,
      indexable: false,
      updatedAt: profile.updatedAt ?? null,
    },
  };
}
