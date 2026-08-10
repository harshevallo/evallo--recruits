/**
 * Internal note endpoints (PRD §11.2, §21.4).
 *
 * Company-scoped only. There is no `/me` counterpart and there must never be one — see the model
 * header for why the separation is structural.
 */

import { z } from 'zod';
import { sendSuccess } from '../../lib/response.js';
import * as notes from './note.service.js';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const companyParams = z.object({ companyId: z.string().trim().min(1).max(80) });

export const listNotesValidation = {
  params: companyParams.extend({ candidateId: objectId }),
};

export const createNoteValidation = {
  params: companyParams.extend({ candidateId: objectId }),
  body: z.object({ body: z.string().trim().min(1, 'Write something first').max(5000) }),
};

export const deleteNoteValidation = {
  params: companyParams.extend({ noteId: objectId }),
};

/** GET /api/companies/:companyId/candidates/:candidateId/notes */
export async function getNotes(req, res) {
  return sendSuccess(res, await notes.listNotes(req.company._id, req.params.candidateId));
}

/** POST /api/companies/:companyId/candidates/:candidateId/notes */
export async function postNote(req, res) {
  return sendSuccess(
    res,
    {
      note: await notes.createNote(
        req.company._id,
        req.user._id,
        req.params.candidateId,
        req.body.body,
      ),
    },
    { status: 201 },
  );
}

/** DELETE /api/companies/:companyId/notes/:noteId */
export async function deleteNote(req, res) {
  return sendSuccess(res, await notes.deleteNote(req.company._id, req.user._id, req.params.noteId));
}
