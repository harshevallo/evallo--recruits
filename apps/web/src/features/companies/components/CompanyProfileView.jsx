import { BackLink, Button, Container } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CompanyProfileHeader } from './CompanyProfileHeader';
import { CompanyOverview } from './CompanyOverview';
import { OpenRoleCard } from './OpenRoleCard';

/**
 * THE company profile. One component, every surface that shows a company.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 *
 * A company profile is reachable at two URLs — `/companies/:slug` anonymously (PUB-02) and
 * `/me/companies/:slug` signed in (CAN-06) — and until this component they were two separate page
 * implementations that happened to render some of the same children. They shared `CompanyOverview`
 * and `OpenRoleCard` and nothing else: the header, the width, the section rhythm, the roles
 * heading and the empty state were each written twice.
 *
 * The predictable thing happened. The public page was rebuilt to the approved reference and the
 * signed-in one was not, so the product had two different-looking company pages at the same time,
 * and which one you saw depended on whether you arrived by link or by browsing while signed in.
 * Restyling the second copy to match would have re-created the same trap for the next change.
 *
 * So the layout lives here ONCE and the pages supply only what genuinely differs between them:
 *
 *   `actions`   the header's controls — anonymous gets "Express interest"; signed-in gets Save,
 *               Block and the interest state, which depend on a relationship an anonymous
 *               visitor does not have.
 *   `banner`    signed-in status messages (blocked, interest already sent, action feedback).
 *   `backTo`    the directory this profile was reached from, which differs per shell.
 *
 * Anything that is the same on both — and that is nearly everything — is not a prop.
 *
 * @param {Function} [onExpressInterest]
 *   Called with a role id, or `''` for general interest. **Omit it entirely** to render the page
 *   with no interest affordance at all: `OpenRoleCard` then drops its Apply button rather than
 *   showing one that does nothing. That is how a blocked company, or REC-06's preview, renders.
 */
export function CompanyProfileView({
  company,
  backTo,
  backLabel = 'All companies',
  actions,
  banner,
  onExpressInterest,
  editStepHref,
  topSpacing,
}) {
  const openRoles = company.openRoles ?? [];
  /* The server's derived answer, `?? isCurrentlyHiring` for payloads from an older deploy — the
     same expression the hero badge reads. Named once here because it was inlined three times. */
  const isHiring = company.isHiring ?? company.isCurrentlyHiring;

  return (
    <>
      <CompanyProfileHeader
        company={company}
        actions={actions}
        topSpacing={topSpacing}
        onExpressInterest={() => onExpressInterest?.('')}
      />

      {backTo && (
        <Container className="py-4">
          <BackLink to={backTo} label={backLabel} />
        </Container>
      )}

      {banner && <Container className="pb-2">{banner}</Container>}

      <Container className="space-y-16 pb-20">
        <CompanyOverview company={company} editStepHref={editStepHref} />

        {/*
          `#open-roles` is a linked anchor from role search results — see `RoleResultCard`. The id
          stays on the section, not the heading, or the scroll lands past the title.
        */}
        <section id="open-roles" className="scroll-mt-24">
          <h2 className="mb-5 flex items-baseline gap-2 text-xl font-bold text-brand-dark">
            {isHiring ? 'Currently hiring' : 'Open roles'}
            {openRoles.length > 0 && (
              <span className="text-base font-medium text-gray-500">({openRoles.length})</span>
            )}
          </h2>

          {openRoles.length > 0 ? (
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {openRoles.map((role) => (
                <OpenRoleCard key={role.id} role={role} onExpressInterest={onExpressInterest} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="filter"
              title="No open roles right now"
              description={
                company.acceptsGeneralInterest
                  ? 'This company still welcomes general interest for future opportunities.'
                  : 'Check back later, or browse other organizations that are hiring.'
              }
              action={
                company.acceptsGeneralInterest && onExpressInterest ? (
                  <Button variant="primary" size="md" onClick={() => onExpressInterest('')}>
                    Share your interest
                  </Button>
                ) : (
                  backTo && (
                    <Button to={backTo} variant="primary" size="md">
                      Browse companies
                    </Button>
                  )
                )
              }
            />
          )}
        </section>
      </Container>
    </>
  );
}
