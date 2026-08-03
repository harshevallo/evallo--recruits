import { FormField, TextInput, Textarea, SelectInput, Checkbox } from '@/components/form';

/**
 * Renders one question from the bank (CAN-02, ADR-007).
 *
 * The control is chosen from the question's `type`, so adding a question is a bank revision and
 * never a frontend change. Options arrive resolved from the server — the client does not hold a
 * second copy of the taxonomy.
 */
export function BuilderQuestion({ question, value, error, disabled, onChange }) {
  const { key, label, help, placeholder, type, options, maxLength } = question;

  return (
    <FormField
      label={label}
      name={key}
      error={error}
      hint={help ?? undefined}
      className="mb-6"
    >
      {(field) => {
        switch (type) {
          case 'long_text':
            return (
              <Textarea
                {...field}
                rows={5}
                maxLength={maxLength ?? undefined}
                placeholder={placeholder ?? undefined}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
              />
            );

          case 'number':
            return (
              <TextInput
                {...field}
                type="number"
                min={question.min ?? undefined}
                max={question.max ?? undefined}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value === '' ? null : e.target.value)}
              />
            );

          case 'single_select':
            return (
              <SelectInput
                {...field}
                options={[{ value: '', label: 'Select…' }, ...(options ?? [])]}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value || null)}
              />
            );

          case 'multi_select': {
            const selected = Array.isArray(value) ? value : [];
            return (
              /*
               * A checkbox group, not a custom multi-select widget: native inputs come with
               * keyboard support and correct screen-reader semantics, and `fieldset`/`legend`
               * is what associates the group with its question (PRD §19 accessibility).
               */
              <fieldset {...field} className="rounded-lg border border-gray-200 p-4">
                <legend className="sr-only">{label}</legend>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {(options ?? []).map((option) => (
                    <Checkbox
                      key={option.value}
                      label={option.label}
                      checked={selected.includes(option.value)}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange(
                          key,
                          e.target.checked
                            ? [...selected, option.value]
                            : selected.filter((v) => v !== option.value),
                        )
                      }
                    />
                  ))}
                </div>
              </fieldset>
            );
          }

          default:
            return (
              <TextInput
                {...field}
                type="text"
                maxLength={maxLength ?? undefined}
                placeholder={placeholder ?? undefined}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
              />
            );
        }
      }}
    </FormField>
  );
}

/** Marks questions that PRD §8.5 requires before the profile can be published. */
export function publishHint(question) {
  return question.requiredForPublish ? 'Needed to publish' : null;
}
