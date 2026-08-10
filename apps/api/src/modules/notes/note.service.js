/**
 * Internal notes (PRD §11.2, §21.4).
 *
 * Every function here is company-scoped and reachable only from company routes behind
 * `note:write` / `candidate:view`. There is deliberately no candidate-facing read path.
 */

import { ApiError } from '../../lib/ApiError.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { resolveCandidateAccess } from '../candidates/candidateAccess.service.js';
import { User } from '../users/user.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/auditEvent.model.js';
import { Note } from './note.model.js';

/**
 * A note is about a candidate this company can see.
 *
 * Checked on write as well as read: without it a recruiter could accumulate commentary on someone
 * who never made themselves visible to the company, which is precisely the "recruiters access
 * candidate data only via active company membership and candidate consent" rule in PRD §16.1.
 */
async function assertCandidateVisible(companyId, candidateId) {
  const profile = await CandidateProfile.findById(candidateId);
  if (!profile) throw ApiError.notFound('Candidate not found.');

  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) throw ApiError.notFound('Candidate not found.');

  return profile;
}

function present(note, author) {
  return {
    id: String(note._id),
    body: note.body,
    authorUserId: String(note.authorUserId),
    authorName: author?.name ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export async function listNotes(companyId, candidateId) {
  await assertCandidateVisible(companyId, candidateId);

  const notes = await Note.find({ companyId, candidateId }).sort({ createdAt: -1 });

  const authors = await User.find({ _id: { $in: notes.map((note) => note.authorUserId) } })
    .select('name')
    .lean();
  const byId = new Map(authors.map((author) => [String(author._id), author]));

  return { notes: notes.map((note) => present(note, byId.get(String(note.authorUserId)))) };
}

export async function createNote(companyId, actorUserId, candidateId, body) {
  await assertCandidateVisible(companyId, candidateId);

  const note = await Note.create({ companyId, candidateId, authorUserId: actorUserId, body });

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.NOTE_CREATED,
    targetType: AUDIT_TARGET_TYPES.NOTE,
    targetId: note._id,
    metadata: { candidateId: String(candidateId) },
  });

  const author = await User.findById(actorUserId).select('name').lean();
  return present(note, author);
}

/**
 * Removing a note.
 *
 * Only its author may delete it. A shared company record that anyone can erase is not a record —
 * and PRD §16.3's appeals-with-an-audit-trail requirement means deletions have to be attributable.
 */
export async function deleteNote(companyId, actorUserId, noteId) {
  const note = await Note.findOne({ _id: noteId, companyId });
  if (!note) throw ApiError.notFound('That note does not exist.');

  if (String(note.authorUserId) !== String(actorUserId)) {
    throw ApiError.forbidden('Only the person who wrote a note can remove it.');
  }

  await note.deleteOne();

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.NOTE_DELETED,
    targetType: AUDIT_TARGET_TYPES.NOTE,
    targetId: note._id,
    metadata: { candidateId: String(note.candidateId) },
  });

  return { deleted: true };
}
