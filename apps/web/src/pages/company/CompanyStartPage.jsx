import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COMPANY_ROLE_LABELS } from '@evallo/shared';
import { Avatar, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { CreateCompanyForm } from '@/features/account/components/CreateCompanyForm';
import { useAuth } from '@/context/AuthContext';
import { fetchMyInvitations, acceptInvitation, declineInvitation } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-01 — create or join a company (PRD §7.2).
 *
 * Two ways into the recruiter capability, on one screen: create a company, or accept an
 * invitation someone has already sent you. Both end in an ACTIVE `CompanyMember` row, which is
 * the only thing that makes a user a recruiter (ADR-001).
 *
 * Creation reuses `CreateCompanyForm` — the same component HOME-01 shows in its modal — so the
 * two entry points cannot drift apart.
 *
 * Searching for and claiming an existing company (also listed under REC-01) needs the duplicate
 * detection described in PRD §21.2, which arrives with company verification. Not built here.
 */
export function CompanyStartPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [invites, setInvites] = useState({ status: 'loading', items: [] });
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchMyInvitations({ signal: controller.signal })
      .then((items) => setInvites({ status: 'ready', items }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setInvites({ status: 'error', items: [], message: error.message });
      });

    return () => controller.abort();
  }, []);

  async function respond(invite, accept) {
    setBusyId(invite.id);
    setFeedback(null);
    try {
      if (accept) {
        const result = await acceptInvitation(invite.id);
        // The capability is derived per request, so refresh before routing into the company.
        await refresh().catch(() => {});
        navigate(buildPath(PATHS.COMPANY_HOME, { companySlug: result.company.slug }));
        return;
      }

      await declineInvitation(invite.id);
      setInvites((current) => ({
        ...current,
        items: current.items.filter((i) => i.id !== invite.id),
      }));
      setFeedback({ tone: 'success', text: `Declined the invitation from ${invite.company.name}.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not complete that.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Container className="py-32">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">
          Create or join a company
        </h1>
        <p className="mt-2 max-w-xl text-gray-600">
          A company is a separate context on the same account. Joining one does not change your
          personal profile, and you can belong to several.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section
          aria-labelledby="create-heading"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 id="create-heading" className="mb-1 text-lg font-bold text-brand-dark">
            Create a company
          </h2>
          <p className="mb-5 text-sm text-gray-600">
            You become its owner. It starts as a draft — nothing is public until you publish it.
          </p>

          <CreateCompanyForm
            onCreated={async (company) => {
              await refresh().catch(() => {});
              // Straight into the setup wizard: a bare company is not yet publishable.
              navigate(buildPath(PATHS.COMPANY_SETUP, { companySlug: company.slug }));
            }}
          />
        </section>

        <section
          aria-labelledby="join-heading"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 id="join-heading" className="mb-1 text-lg font-bold text-brand-dark">
            Join a company
          </h2>
          <p className="mb-5 text-sm text-gray-600">
            Invitations sent to your email address appear here.
          </p>

          {invites.status === 'loading' && (
            <div role="status" aria-live="polite">
              <span className="sr-only">Loading your invitations…</span>
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          )}

          {invites.status === 'error' && (
            <StatusRegion tone="error">
              {invites.message ?? 'We could not load your invitations.'}
            </StatusRegion>
          )}

          {invites.status === 'ready' && invites.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
              <Icon name="building" className="text-2xl text-gray-300" />
              <p className="mt-3 text-sm text-gray-600">
                No pending invitations. Ask a company owner or admin to invite this email address.
              </p>
            </div>
          )}

          {invites.status === 'ready' && invites.items.length > 0 && (
            <ul className="space-y-3">
              {invites.items.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center"
                >
                  <Avatar
                    src={invite.company.logoUrl}
                    initials={invite.company.initials}
                    size="sm"
                    shape="rounded"
                    tone="brand"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-brand-dark">
                      {invite.company.name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      Invited as {COMPANY_ROLE_LABELS[invite.role] ?? invite.role}
                      {invite.invitedBy &&
                        ` by ${invite.invitedBy.name ?? invite.invitedBy.email}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      radius="lg"
                      disabled={busyId === invite.id}
                      onClick={() => respond(invite, true)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outlineDark"
                      size="sm"
                      radius="lg"
                      className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                      disabled={busyId === invite.id}
                      onClick={() => respond(invite, false)}
                    >
                      Decline
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-10">
        <Button
          to={PATHS.APP_HOME}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          <Icon name="arrow-right" className="rotate-180 text-xs" />
          Back to home
        </Button>
      </div>
    </Container>
  );
}
