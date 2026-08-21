/**
 * The candidate share link — ADR-019.
 *
 * A revocable secret that lets a candidate hand their portfolio to someone who has no Evallo
 * account: a school principal, an agency, a referrer. It is the ONLY unauthenticated candidate
 * surface in the product, and ADR-019 records why PRD §21.2's blanket wording is amended rather
 * than worked around.
 *
 * Five properties are what make it defensible, and each is enforced here rather than by the
 * caller:
 *
 *   1. **Unguessable.** 32 bytes from the CSPRNG, base64url. The URL is the credential; there is
 *      no id, slug or name in it, so the address discloses nothing about the person and cannot be
 *      reached by enumerating candidates.
 *   2. **Revocable, and revocation is total.** Disabling or rotating CLEARS the stored token, so
 *      the old link becomes unresolvable rather than merely refused. There is no window in which
 *      a withdrawn link still identifies a profile.
 *   3. **Never widens visibility.** A link holder is one more audience for the SAME projection.
 *      `status` still gates access, per-item visibility still filters entries, and contact is
 *      still revealed only by the candidate's own contact rule.
 *   4. **Off by default.** Nothing mints a token implicitly. Publishing does not create a link,
 *      and neither does previewing one.
 *   5. **Silent about non-existence.** Every refusal is the same 404. A caller cannot use the
 *      endpoint to learn whether a token was ever valid, whose it was, or why it stopped working.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { CandidateProfile } from './candidateProfile.model.js';
import { loadPortfolio } from './portfolio.service.js';

/**
 * States in which a share link resolves.
 *
 * `draft` and `archived` are excluded because neither is a published profile: a draft has never
 * been offered to anyone, and an archived one belongs to a closed account. `paused` IS included —
 * PRD §4.3 defines paused as removal from NEW discovery, and following a link someone was
 * personally given is not discovery. The candidate who wants the link dead turns the link off,
 * which is a separate and more direct control than their search visibility.
 */
const SHAREABLE_STATES = Object.freeze([
  CANDIDATE_VISIBILITY.PRIVATE,
  CANDIDATE_VISIBILITY.DISCOVERABLE,
  CANDIDATE_VISIBILITY.PAUSED,
]);

/** 43 base64url characters. Long enough that online guessing is not a threat model. */
function mintToken() {
  return randomBytes(32).toString('base64url');
}

/** Constant-time compare, so a mismatch cannot be narrowed down by response timing. */
function tokensMatch(stored, supplied) {
  if (typeof stored !== 'string' || typeof supplied !== 'string') return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The share state as the candidate's own screen shows it.
 *
 * Returns the token itself — this is the OWNER's endpoint, and a share panel that cannot display
 * the link it manages is useless. Every other surface receives `enabled` and nothing more.
 */
export async function getShareState(profile) {
  /* `shareToken` is `select: false`, so it must be asked for explicitly even by its owner. */
  const withToken = await CandidateProfile.findById(profile._id).select('+shareToken').lean();

  const enabled = Boolean(withToken?.shareEnabled && withToken?.shareToken);

  return {
    enabled,
    token: enabled ? withToken.shareToken : null,
    createdAt: withToken?.shareTokenCreatedAt ?? null,
    /*
     * Why the link may not work even while enabled. The candidate is told this plainly rather
     * than discovering it from a recipient — a share panel that says "on" while the profile is a
     * draft is the failure this field exists to prevent.
     */
    resolvable: enabled && SHAREABLE_STATES.includes(profile.status),
    status: profile.status,
    contactVisibility: profile.contactVisibility,
  };
}

/**
 * Turns the link on, minting a token the first time.
 *
 * Idempotent: enabling an already-enabled link returns the SAME token rather than rotating it.
 * Rotation invalidates every copy the candidate has already sent, so it must be an explicit act
 * and never a side effect of pressing "share" twice.
 */
export async function enableShare(profile) {
  const current = await CandidateProfile.findById(profile._id).select('+shareToken');

  if (!current.shareToken) {
    current.shareToken = mintToken();
    current.shareTokenCreatedAt = new Date();
  }
  current.shareEnabled = true;
  await current.save();

  return getShareState(current);
}

/** A new secret. Every previously shared link stops resolving immediately. */
export async function rotateShare(profile) {
  const current = await CandidateProfile.findById(profile._id).select('+shareToken');

  current.shareToken = mintToken();
  current.shareTokenCreatedAt = new Date();
  current.shareEnabled = true;
  await current.save();

  return getShareState(current);
}

/**
 * Turns the link off and destroys the secret.
 *
 * `$unset` rather than `null`: the partial unique index only covers string values, and an absent
 * field is what makes a revoked link unresolvable rather than a row that still answers to
 * something.
 */
export async function disableShare(profile) {
  await CandidateProfile.updateOne(
    { _id: profile._id },
    { $set: { shareEnabled: false }, $unset: { shareToken: '', shareTokenCreatedAt: '' } },
  );

  const refreshed = await CandidateProfile.findById(profile._id);
  return getShareState(refreshed);
}

/**
 * Resolves a share token to a portfolio, or refuses.
 *
 * Every failure path throws the SAME 404 with the same message. A token that never existed, one
 * that was rotated, one belonging to a draft profile and one belonging to a deleted account are
 * deliberately indistinguishable: distinguishing them would confirm that a person is on the
 * platform, which is itself a disclosure about someone who has chosen not to be seen (PRD §16.1).
 *
 * @param {string} token
 * @returns {Promise<object>} the public portfolio payload
 */
export async function resolveSharedPortfolio(token) {
  const refuse = () => ApiError.notFound('This portfolio link is not available.');

  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw refuse();

  const profile = await CandidateProfile.findOne({ shareToken: token }).select('+shareToken');

  if (!profile) throw refuse();
  if (!tokensMatch(profile.shareToken, token)) throw refuse();
  if (!profile.shareEnabled) throw refuse();
  if (profile.deletedAt) throw refuse();
  if (!SHAREABLE_STATES.includes(profile.status)) throw refuse();

  const user = await User.findById(profile.userId)
    .select('name profilePicture location languages email')
    .lean();

  if (!user) throw refuse();

  const portfolio = await loadPortfolio(profile);

  /*
   * Contact reaches a link holder ONLY under `authorized_recruiters` — the same rule that governs
   * a signed-in recruiter, applied unchanged.
   *
   * `after_interest` and `on_request` both resolve to hidden here, and not by accident: both are
   * defined by a relationship with a specific COMPANY, and an anonymous link holder is not a
   * company. There is no interest to have expressed and no request to approve, so the only
   * honest resolution is to withhold.
   */
  const contactRevealed = profile.contactVisibility === CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS;

  return {
    profile: profile.toRecruiterView(
      {
        name: user.name ?? null,
        photoUrl: user.profilePicture ?? null,
        location: user.location ?? null,
        languages: user.languages ?? [],
        email: user.email,
        contactRevealed,
      },
      portfolio,
    ),

    /**
     * Everything a share page needs to render itself, and nothing that identifies the candidate
     * beyond what the portfolio already shows.
     *
     * No id, no slug, no user id, no timestamps: a link holder can read the portfolio but cannot
     * use it to address the candidate anywhere else in the system.
     */
    meta: {
      /** Always. `noindex` on every share page, whatever the visibility state (ADR-004, §17). */
      indexable: false,
      updatedAt: profile.updatedAt ?? null,
    },
  };
}
