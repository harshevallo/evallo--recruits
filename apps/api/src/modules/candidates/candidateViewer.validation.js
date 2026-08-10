/**
 * REC-13 request contract (ADR-009).
 */

import { z } from 'zod';
import { VIEW_SOURCES } from './candidateViewer.service.js';

export const candidateViewerValidation = {
  params: z.object({
    companyId: z.string().trim().min(1).max(80),
    candidateId: z
      .string()
      .trim()
      .regex(/^[a-f\d]{24}$/i, 'Invalid candidate'),
  }),
  /** `source` is an audit field (PRD §21.4), so it is constrained rather than free text. */
  query: z.object({
    source: z.enum(VIEW_SOURCES).default('direct'),
  }),
};
