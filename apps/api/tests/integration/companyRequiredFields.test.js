/**
 * Company setup — required-field validation on save (REC-02).
 *
 * ── Why a CLIENT validator is tested from the API suite ───────────────────────────────────────
 *
 * Because the thing worth pinning is the JOIN between the two halves, and it spans both. The
 * server decides WHICH fields are required (`buildPublishChecklist`); the client decides which
 * control each one maps to (`requiredFields.js`). Either half can be correct on its own while the
 * pair is broken — a checklist key with no adapter is silently skipped, so adding a requirement in
 * §7.3 would produce a field the Save button never checks and nothing would fail.
 *
 * So these tests feed the REAL checklist into the REAL client adapter. `apps/web` has no test
 * runner; this suite already runs on every change and already imports the service under test.
 *
 * ── What is deliberately NOT asserted ─────────────────────────────────────────────────────────
 *
 * That `saveCompanyStep` rejects a partial step. It does not, by design: PRD §7.2 is draft-first
 * and the API contract did not change. The gate added on 2026-08-25 is in the wizard's Save
 * button only. The last group below pins that, so a future reader does not "fix" the server to
 * match the client.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { COMPANY_STATUS } from '@evallo/shared';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { Company } from '../../src/modules/companies/company.model.js';
import {
  buildPublishChecklist,
  buildWizardState,
  saveCompanyStep,
  toEditorView,
  COMPANY_WIZARD_STEPS,
} from '../../src/modules/companies/company.service.js';

const SLUG = 'req-fields-test-co';

/**
 * Loads the client module into this Node process.
 *
 * It lives in `apps/web` and is plain ESM, but the import specifier `@/…` is a Vite alias Node
 * cannot resolve, so it is compiled to a temporary sibling file. Compiling the real source is the
 * whole point — a hand-copied duplicate of the adapter table would pass forever while the shipped
 * one rotted.
 */
const CLIENT_SRC = new URL(
  '../../../web/src/features/companies/requiredFields.js',
  import.meta.url,
);
const TEMP = new URL('./__requiredFields.generated.mjs', import.meta.url);

let missingRequiredFields;
let REQUIRED_FIELD_ADAPTERS;

before(async () => {
  const source = readFileSync(CLIENT_SRC, 'utf8');
  const { code } = transformSync(source, { loader: 'js', format: 'esm' });
  writeFileSync(TEMP, code);

  ({ missingRequiredFields, REQUIRED_FIELD_ADAPTERS } = await import(TEMP.href));

  await connectDatabase();
});

after(async () => {
  await Company.deleteMany({ slug: SLUG });
  await disconnectDatabase();
  try {
    unlinkSync(TEMP);
  } catch {
    /* Already gone. */
  }
});

/** The page's `valueFor`: the pending draft layered over the saved company. */
const readerFor = (company, draft = {}) => (field) =>
  field in draft ? draft[field] : toEditorView(company)[field];

async function makeCompany(overrides = {}) {
  await Company.deleteMany({ slug: SLUG });
  return Company.create({
    slug: SLUG,
    name: 'Required Fields Test Co',
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.DRAFT,
    location: { country: 'IN' },
    ...overrides,
  });
}

let company;
beforeEach(async () => {
  company = await makeCompany();
});

describe('the client adapter covers the server checklist', () => {
  test('every checklist key is either mapped or knowingly unmapped', () => {
    const checklist = buildPublishChecklist(company);
    const unmapped = checklist.items
      .map((item) => item.key)
      .filter((key) => !REQUIRED_FIELD_ADAPTERS[key]);

    /*
     * `slug` alone. If this fails, PRD §7.3 gained a requirement and the wizard has no control
     * for it — the Save button would skip it silently, which is the exact failure this pins.
     */
    assert.deepEqual(unmapped, ['slug'], 'a new required field needs an adapter in requiredFields.js');
  });

  test('every mapped field names a real step and a real editor field', () => {
    const stepFields = new Set(COMPANY_WIZARD_STEPS.flatMap((s) => s.fields));
    const editorKeys = new Set(Object.keys(toEditorView(company)));

    for (const [key, adapter] of Object.entries(REQUIRED_FIELD_ADAPTERS)) {
      /* `country` is drawn on its own but stored inside `location`. */
      const backing = adapter.field === 'country' ? 'location' : adapter.field;
      assert.ok(stepFields.has(backing), `${key} → ${backing} is not a wizard field`);
      assert.ok(editorKeys.has(backing), `${key} → ${backing} is not in the editor view`);
    }
  });
});

describe('empty required field → Save blocked', () => {
  test('the brand step with no tagline and no description reports both', () => {
    const { errors, labels } = missingRequiredFields({
      checklistItems: buildPublishChecklist(company).items,
      stepKey: 'brand',
      valueFor: readerFor(company),
    });

    assert.deepEqual(Object.keys(errors).sort(), ['descriptionShort', 'tagline']);
    assert.deepEqual(labels, ['Tagline', 'Short description'], "the server's own wording");
    assert.equal(errors.descriptionShort, 'Short description is required.');
  });

  test('whitespace is not a value', () => {
    const { errors } = missingRequiredFields({
      checklistItems: buildPublishChecklist(company).items,
      stepKey: 'brand',
      valueFor: readerFor(company, { tagline: '   ', descriptionShort: '\n\t ' }),
    });

    assert.deepEqual(Object.keys(errors).sort(), ['descriptionShort', 'tagline']);
  });

  test('one field filled still blocks on the other', () => {
    const { errors, labels } = missingRequiredFields({
      checklistItems: buildPublishChecklist(company).items,
      stepKey: 'brand',
      valueFor: readerFor(company, { tagline: 'We teach physics' }),
    });

    assert.deepEqual(Object.keys(errors), ['descriptionShort']);
    assert.deepEqual(labels, ['Short description']);
  });

  test('an empty education-services selection blocks the footprint step', () => {
    const { errors } = missingRequiredFields({
      checklistItems: buildPublishChecklist(company).items,
      stepKey: 'footprint',
      valueFor: readerFor(company, { educationServices: [] }),
    });

    assert.deepEqual(Object.keys(errors), ['educationServices']);
  });

  test('a missing country blocks the basics step, under its own field name', () => {
    const noCountry = { ...company.toObject(), location: { country: '' } };
    const { errors } = missingRequiredFields({
      checklistItems: buildPublishChecklist(noCountry).items,
      stepKey: 'basics',
      valueFor: (field) => (field === 'location' ? { country: '' } : company[field]),
    });

    assert.ok(errors.country, 'the error must key on the control, not on `location`');
    assert.ok(!errors.location);
  });
});

describe('valid required field → Save proceeds', () => {
  test('a complete brand step reports nothing', () => {
    const { errors, labels } = missingRequiredFields({
      checklistItems: buildPublishChecklist(company).items,
      stepKey: 'brand',
      valueFor: readerFor(company, {
        tagline: 'We teach physics',
        descriptionShort: 'Small-group physics tuition.',
      }),
    });

    assert.deepEqual(errors, {});
    assert.deepEqual(labels, []);
  });

  test('an UNSAVED draft value satisfies the check', () => {
    /* The saved company is empty; only the draft has the text. The gate must read the draft. */
    assert.equal(company.description?.short ?? '', '');

    const { errors } = missingRequiredFields({
      checklistItems: buildPublishChecklist(company).items,
      stepKey: 'brand',
      valueFor: readerFor(company, {
        tagline: 'Typed but not yet saved',
        descriptionShort: 'Also typed but not yet saved.',
      }),
    });

    assert.deepEqual(errors, {}, 'server `done` flags describe the last save, not the screen');
  });

  test('editing an existing company: already-saved values satisfy the check with no draft', async () => {
    const filled = await makeCompany({
      tagline: 'Already saved',
      description: { short: 'Already saved short description.' },
    });

    const { errors } = missingRequiredFields({
      checklistItems: buildPublishChecklist(filled).items,
      stepKey: 'brand',
      valueFor: readerFor(filled),
    });

    assert.deepEqual(errors, {}, 'opening a complete step must not show errors');
  });

  test('a step with no required fields never blocks', () => {
    for (const step of COMPANY_WIZARD_STEPS) {
      const items = buildPublishChecklist(company).items.filter((i) => i.step === step.key);
      if (items.length > 0) continue;

      const { errors } = missingRequiredFields({
        checklistItems: buildPublishChecklist(company).items,
        stepKey: step.key,
        valueFor: readerFor(company),
      });
      assert.deepEqual(errors, {});
    }
  });
});

describe('the API contract is unchanged', () => {
  test('saveCompanyStep still accepts a partial step (PRD §7.2 draft-first)', async () => {
    const saved = await saveCompanyStep(SLUG, 'brand', { tagline: 'Only a tagline' });

    assert.equal(saved.company.tagline, 'Only a tagline');
    assert.equal(saved.company.descriptionShort, '', 'the server did not start rejecting drafts');
  });

  test('publish validation is unchanged and still names the same blockers', async () => {
    let checklist = buildPublishChecklist(company);
    assert.equal(checklist.canPublish, false);
    assert.deepEqual(checklist.blockers, [
      'Tagline',
      'Short description',
      'At least one education service',
    ]);

    const complete = await makeCompany({
      tagline: 'Complete',
      description: { short: 'Complete short description.' },
      educationServices: ['academic_tutoring'],
    });

    checklist = buildPublishChecklist(complete);
    assert.equal(checklist.canPublish, true);
    assert.deepEqual(checklist.blockers, []);
  });

  test('wizard progress counts are unchanged', () => {
    const { steps } = buildWizardState(company);
    const brand = steps.find((s) => s.key === 'brand');

    assert.equal(brand.requiredTotal, 2);
    assert.equal(brand.requiredDone, 0);
    assert.equal(brand.complete, false);
    assert.deepEqual(brand.missing, ['Tagline', 'Short description']);
  });

  test('no optional field became required', () => {
    const required = new Set(buildPublishChecklist(company).items.map((i) => i.key));

    for (const optional of ['website', 'descriptionFull', 'foundingYear', 'sizeRange', 'deliveryModes', 'subjects']) {
      assert.ok(!required.has(optional), `${optional} must stay optional`);
      assert.ok(!REQUIRED_FIELD_ADAPTERS[optional], `${optional} must have no required-field adapter`);
    }
  });
});
