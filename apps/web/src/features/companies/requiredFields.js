/**
 * Required-field checking for the company setup wizard (REC-02).
 *
 * ── Why this is an adapter and not a list of required fields ──────────────────────────────────
 *
 * WHICH fields are required is decided in exactly one place: `buildPublishChecklist()` in
 * `company.service.js`. It already reaches the client as `checklist.items`, each carrying a
 * `key`, a human `label`, and the wizard `step` it belongs to. Re-declaring "tagline and short
 * description are required" here would be a second source of truth, and the two would drift the
 * first time PRD §7.3 changed — the comment beside that function warns about precisely that.
 *
 * So this module answers only the question the server cannot: given a checklist `key`, which
 * control holds it in the wizard form, and what counts as filled. Nothing here decides that a
 * field is required, and nothing here can make an optional field required — a key absent from
 * the server's checklist is never looked at.
 *
 * ── Draft state, not saved state ──────────────────────────────────────────────────────────────
 *
 * The server's `done` flag describes the LAST SAVED company. The wizard needs to judge what is on
 * screen right now, including edits not yet sent. That is why every check runs through the page's
 * `valueFor`, which layers the draft over the saved company.
 */

/**
 * Checklist key → the control that holds it, and how to read it.
 *
 * `slug` is deliberately absent. It is on the publish checklist but has no control in the wizard:
 * it is generated at creation and cannot be blank on a company that already exists. An unmapped
 * key is skipped here and left to publish validation, which is the only place that can judge it.
 */
export const REQUIRED_FIELD_ADAPTERS = Object.freeze({
  name: { field: 'name', read: (get) => get('name') },
  organizationType: { field: 'organizationType', read: (get) => get('organizationType') },
  /* Stored nested under `location`, but drawn as its own control — so the error belongs to `country`. */
  country: { field: 'country', read: (get) => get('location')?.country },
  tagline: { field: 'tagline', read: (get) => get('tagline') },
  descriptionShort: { field: 'descriptionShort', read: (get) => get('descriptionShort') },
  educationServices: {
    field: 'educationServices',
    read: (get) => get('educationServices'),
    filled: (value) => (value ?? []).length > 0,
  },
});

/** Default emptiness test: present, and not only whitespace. */
export const isFilled = (value) => Boolean(String(value ?? '').trim());

/**
 * The required fields of one step that are still empty.
 *
 * @param {object}   options
 * @param {Array}    options.checklistItems  `checklist.items` from the server, unmodified
 * @param {string}   options.stepKey         the step being saved
 * @param {Function} options.valueFor        `(field) => value`, draft layered over saved company
 * @returns {{ errors: Record<string,string>, labels: string[] }}
 *          `errors` is field-keyed for `FormField`; `labels` is in the server's own order and
 *          wording, for the summary message. Both are empty when the step is complete.
 */
export function missingRequiredFields({ checklistItems = [], stepKey, valueFor }) {
  const errors = {};
  const labels = [];

  for (const item of checklistItems) {
    if (item.step !== stepKey) continue;

    const adapter = REQUIRED_FIELD_ADAPTERS[item.key];
    /* No control for this key in the wizard (`slug`) — publish validation still covers it. */
    if (!adapter) continue;

    const filled = adapter.filled ?? isFilled;
    if (filled(adapter.read(valueFor))) continue;

    /* The server's own label, so the wording never drifts from the publish checklist. */
    errors[adapter.field] = `${item.label} is required.`;
    labels.push(item.label);
  }

  return { errors, labels };
}
