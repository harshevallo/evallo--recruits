import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { COMPANY_ROLES, COMPANY_ROLE_LABELS, PERMISSIONS, can } from '@evallo/shared';
import { Badge, Button, Container, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { useAuth } from '@/context/AuthContext';
import {
  fetchCompanyJoinRequests,
  approveJoinRequest,
  declineJoinRequest,
  fetchCompanyInvitations,
  fetchCompanyMembers,
  inviteTeamMember,
  resendCompanyInvitation,
  cancelCompanyInvitation,
  changeMemberRole,
  removeCompanyMember,
  transferCompanyOwnership,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-07 invitations, REC-08 team management and REC-09 ownership transfer (PRD §7.2, §4.2).
 *
 * One screen, because they are one question — "who belongs to this company, and with what
 * authority" — and because all three act on the same `CompanyMember` row. Accepting an invitation
 * is the exception: that is REC-01, on the invitee's own screen, since the invitee is not yet a
 * member and cannot be authorised company-scoped.
 *
 * Every control here is mirrored by a server-side check. The UI hides what would be rejected so
 * nobody is offered an action that fails, but hiding is never the enforcement.
 */

/** Relative when recent, absolute once it stops being useful. Invitations are short-lived. */
function formatWhen(value) {
  if (!value) return null;
  const then = new Date(value);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);

  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One display name for a member, whatever the record actually has on it. */
function nameOf(member) {
  return member.user?.name || member.user?.email || 'this member';
}

/**
 * Roles selectable for an EXISTING member.
 *
 * `owner` is not offered as a promotion: that is a transfer, and listing it beside four
 * reversible choices would make an irreversible change look like one of them. "Make owner" is a
 * separate, confirmed action.
 *
 * It IS kept when the member already holds it, so the select shows their actual role rather than
 * rendering blank — an owner being demoted picks any other option, which is a normal role change.
 */
function memberRoleOptions(currentRole) {
  return Object.entries(COMPANY_ROLE_LABELS)
    .filter(([role]) => role !== COMPANY_ROLES.OWNER || role === currentRole)
    .map(([value, label]) => ({ value, label }));
}

export function CompanyTeamPage() {
  const { companySlug } = useParams();
  const { user, refresh } = useAuth();

  const [state, setState] = useState({
    status: 'loading',
    invitations: [],
    members: [],
    joinRequests: [],
  });
  const [form, setForm] = useState({ email: '', role: COMPANY_ROLES.RECRUITER });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSending, setIsSending] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  /** `{ kind: 'remove' | 'transfer', member }` — both are irreversible enough to confirm. */
  const [confirming, setConfirming] = useState(null);
  /** Role chosen per join request, keyed by request id. The request itself is never mutated. */
  const [pickedRoles, setPickedRoles] = useState({});

  const load = useCallback(
    async (signal) => {
      /*
       * The roster comes from the members endpoint and the pending list from the invitations
       * endpoint. Both are behind `member:manage`, so a caller who can see one can see the other
       * — there is no partial state to design around.
       */
      const [invitationData, memberData, joinData] = await Promise.all([
        fetchCompanyInvitations(companySlug, { signal }),
        fetchCompanyMembers(companySlug, { signal }),
        fetchCompanyJoinRequests(companySlug, { signal }),
      ]);

      setState({
        status: 'ready',
        invitations: invitationData.invitations,
        members: memberData.members,
        joinRequests: joinData.requests,
        yourRole: invitationData.yourRole,
      });
    },
    [companySlug],
  );

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal).catch((error) => {
      if (controller.signal.aborted || error.name === 'CanceledError') return;
      setState({
        status: 'error',
        invitations: [],
        members: [],
        joinRequests: [],
        message: error.message,
      });
    });

    return () => controller.abort();
  }, [load]);

  /*
   * Which roles this user may hand out. `member:manage` lets an admin invite, but only a member
   * who could transfer ownership may create another owner — the server enforces this, and the UI
   * simply does not offer what would be rejected.
   */
  const membership = { role: state.yourRole, status: 'active' };
  /**
   * Approving a join request (REC-01).
   *
   * The role comes from THIS screen, never from the request — otherwise someone could ask for
   * `owner` and be granted it. The server enforces the same rule.
   */
  async function decideJoinRequest(request, approve, role) {
    setBusyId(request.id);
    setFeedback(null);
    try {
      if (approve) {
        const result = await approveJoinRequest(companySlug, request.id, role);
        setFeedback({
          tone: 'success',
          text: `${request.user?.name || request.user?.email} joined as ${
            COMPANY_ROLE_LABELS[result.request.grantedRole] ?? result.request.grantedRole
          }.`,
        });
      } else {
        await declineJoinRequest(companySlug, request.id);
        setFeedback({ tone: 'success', text: 'Request declined.' });
      }
      // Refetch rather than patch: approval creates a member, so two lists change at once.
      await load();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.role ?? error.message ?? 'We could not complete that.',
      });
    } finally {
      setBusyId(null);
    }
  }

  const roleOptions = Object.entries(COMPANY_ROLE_LABELS)
    .filter(
      ([role]) => role !== COMPANY_ROLES.OWNER || can(membership, PERMISSIONS.COMPANY_TRANSFER),
    )
    .map(([value, label]) => ({ value, label }));

  async function submitInvitation(event) {
    event.preventDefault();
    setIsSending(true);
    setFieldErrors({});
    setFeedback(null);

    try {
      const { invitation } = await inviteTeamMember(companySlug, form);

      setState((current) => ({
        ...current,
        invitations: [invitation, ...current.invitations],
      }));
      setForm({ email: '', role: COMPANY_ROLES.RECRUITER });
      setFeedback({
        tone: 'success',
        text: `Invitation sent to ${invitation.email}. They join as ${
          COMPANY_ROLE_LABELS[invitation.role] ?? invitation.role
        } once they accept.`,
      });
    } catch (error) {
      // Field-keyed details map straight onto the input (04_API_DOCUMENTATION.md §1).
      setFieldErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not send that invitation.' });
      }
    } finally {
      setIsSending(false);
    }
  }

  async function resend(invitation) {
    setBusyId(invitation.id);
    setFeedback(null);
    try {
      const result = await resendCompanyInvitation(companySlug, invitation.id);
      setState((current) => ({
        ...current,
        invitations: current.invitations.map((item) =>
          item.id === invitation.id ? { ...item, lastSentAt: result.lastSentAt } : item,
        ),
      }));
      setFeedback({ tone: 'success', text: `Invitation resent to ${invitation.email}.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not resend that invitation.' });
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(invitation) {
    setBusyId(invitation.id);
    setFeedback(null);
    try {
      await cancelCompanyInvitation(companySlug, invitation.id);
      setState((current) => ({
        ...current,
        invitations: current.invitations.filter((item) => item.id !== invitation.id),
      }));
      setFeedback({ tone: 'success', text: `Invitation to ${invitation.email} cancelled.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not cancel that invitation.' });
    } finally {
      setBusyId(null);
    }
  }

  /* ── REC-08 / REC-09 ────────────────────────────────────────────────────────────────────── */

  async function updateRole(member, role) {
    setBusyId(member.id);
    setFeedback(null);
    try {
      const result = await changeMemberRole(companySlug, member.id, role);
      setState((current) => ({
        ...current,
        members: current.members.map((item) => (item.id === member.id ? result.member : item)),
      }));
      setFeedback({
        tone: 'success',
        text: `${nameOf(member)} is now ${COMPANY_ROLE_LABELS[result.member.role]}.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not change that role.' });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove(member) {
    setBusyId(member.id);
    setFeedback(null);
    try {
      await removeCompanyMember(companySlug, member.id);
      setState((current) => ({
        ...current,
        members: current.members.filter((item) => item.id !== member.id),
      }));
      setFeedback({ tone: 'success', text: `${nameOf(member)} no longer has access.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not remove that member.' });
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  }

  async function confirmTransfer(member) {
    setBusyId(member.id);
    setFeedback(null);
    try {
      await transferCompanyOwnership(companySlug, member.id);
      /*
       * The caller has just demoted themselves to admin, so their permissions changed mid-session.
       * Reloading both the roster and the auth capabilities is what stops the screen from
       * continuing to offer owner-only controls that the server would now refuse.
       */
      await Promise.all([load(), refresh().catch(() => {})]);
      setFeedback({
        tone: 'success',
        text: `${nameOf(member)} now owns this company. You remain an admin.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not transfer ownership.' });
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  }

  return (
    <Container className="py-32">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Team</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Invite people to help run this company. A role applies here only — it changes nothing
          about their personal account, and they keep any other companies they belong to.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {state.status === 'error' && (
        <StatusRegion tone="error">{state.message ?? 'We could not load your team.'}</StatusRegion>
      )}

      {state.status === 'loading' && (
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">Loading your team…</span>
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/*
            REC-01 join requests. Above the invite form on purpose: someone is already waiting, and
            that is more urgent than starting a new invitation.
          */}
          {(state.joinRequests ?? []).length > 0 && (
            <section
              aria-labelledby="requests-heading"
              className="mb-8 rounded-2xl border border-brand-blue/30 bg-blue-50/30 p-6"
            >
              <h2 id="requests-heading" className="mb-1 text-lg font-bold text-brand-dark">
                Requests to join
              </h2>
              <p className="mb-5 text-sm text-gray-600">
                These people asked to join. Approving one grants access immediately, with the role you
                choose.
              </p>

              <ul className="space-y-3">
                {state.joinRequests.map((request) => (
                  <li
                    key={request.id}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-brand-dark">
                          {request.user?.name || request.user?.email}
                        </p>
                        {request.user?.name && (
                          <p className="text-xs text-gray-500">{request.user.email}</p>
                        )}
                        {request.message && (
                          <p className="mt-2 max-w-prose text-sm text-gray-700">
                            “{request.message}”
                          </p>
                        )}
                      </div>

                      <div className="flex flex-none flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`role-${request.id}`}>
                          Role to grant
                        </label>
                        <SelectInput
                          id={`role-${request.id}`}
                          name={`role-${request.id}`}
                          className="!w-auto !py-2 !text-xs"
                          options={roleOptions}
                          value={pickedRoles[request.id] ?? request.requestedRole}
                          disabled={busyId === request.id}
                          onChange={(event) =>
                            setPickedRoles((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          radius="lg"
                          disabled={busyId === request.id}
                          onClick={() =>
                            decideJoinRequest(
                              request,
                              true,
                              pickedRoles[request.id] ?? request.requestedRole,
                            )
                          }
                        >
                          {busyId === request.id ? 'Working…' : 'Approve'}
                        </Button>
                        <Button
                          type="button"
                          variant="outlineDark"
                          size="sm"
                          radius="lg"
                          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                          disabled={busyId === request.id}
                          onClick={() => decideJoinRequest(request, false)}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            aria-labelledby="invite-heading"
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <h2 id="invite-heading" className="mb-1 text-lg font-bold text-brand-dark">
              Invite a teammate
            </h2>
            <p className="mb-5 text-sm text-gray-600">
              They do not need an Evallo Recruit account yet — we will email them, and the
              invitation waits until they sign up and verify the address.
            </p>

            <form onSubmit={submitInvitation} noValidate>
              <FormField
                label="Email address"
                name="invite-email"
                required
                error={fieldErrors.email}
                hint="The invitation is tied to this exact address."
              >
                {({ hasError: _hasError, ...field }) => (
                  <TextInput
                    {...field}
                    type="email"
                    autoComplete="off"
                    placeholder="teammate@example.com"
                    value={form.email}
                    disabled={isSending}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                )}
              </FormField>

              <FormField
                label="Role"
                name="invite-role"
                required
                error={fieldErrors.role}
                className="mt-5"
              >
                {({ hasError: _hasError, ...field }) => (
                  <SelectInput
                    {...field}
                    options={roleOptions}
                    value={form.role}
                    disabled={isSending}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, role: event.target.value }))
                    }
                  />
                )}
              </FormField>

              <Button
                type="submit"
                variant="primary"
                size="md"
                radius="lg"
                className="mt-6"
                disabled={isSending || form.email.trim() === ''}
              >
                {isSending ? 'Sending…' : 'Send invitation'}
              </Button>
            </form>
          </section>

          <div className="space-y-8">
            <section
              aria-labelledby="pending-heading"
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <h2 id="pending-heading" className="mb-1 text-lg font-bold text-brand-dark">
                Pending invitations
              </h2>
              <p className="mb-5 text-sm text-gray-600">
                Sent but not yet accepted. Cancelling withdraws access immediately.
              </p>

              {state.invitations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
                  <Icon name="user" className="text-2xl text-gray-300" />
                  <p className="mt-3 text-sm text-gray-600">
                    No pending invitations. Anyone you invite appears here until they accept.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {state.invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-start"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-brand-dark">
                            {invitation.email}
                          </span>
                          <Badge tone="neutral" size="sm" radius="full">
                            Pending
                          </Badge>
                        </span>

                        <span className="mt-1 block text-xs text-gray-500">
                          {COMPANY_ROLE_LABELS[invitation.role] ?? invitation.role}
                          {invitation.invitedBy &&
                            ` · invited by ${invitation.invitedBy.name ?? invitation.invitedBy.email}`}
                          {invitation.invitedAt && ` · ${formatWhen(invitation.invitedAt)}`}
                        </span>

                        {!invitation.hasAccount && (
                          <span className="mt-1 block text-xs text-gray-400">
                            No account yet — they join after signing up and verifying this address.
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 gap-2">
                        <Button
                          variant="outlineDark"
                          size="sm"
                          radius="lg"
                          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                          disabled={busyId === invitation.id}
                          onClick={() => resend(invitation)}
                        >
                          Resend
                        </Button>
                        <Button
                          variant="outlineDark"
                          size="sm"
                          radius="lg"
                          className="!border-red-200 !text-red-700 hover:!bg-red-50"
                          disabled={busyId === invitation.id}
                          onClick={() => cancel(invitation)}
                        >
                          Cancel
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="members-heading"
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <h2 id="members-heading" className="mb-1 text-lg font-bold text-brand-dark">
                Current members
              </h2>
              <p className="mb-5 text-sm text-gray-600">
                Everyone with active access to this company.
              </p>

              <ul className="space-y-3">
                {state.members.map((member) => {
                  const isYou = member.user?.id === user?.id;
                  /*
                   * Anything touching an owner — promoting to one, changing one's role, removing
                   * one — needs `company:transfer`, not merely `member:manage`. Same rule the
                   * service applies; asked here only so the control is not offered in vain.
                   */
                  const mayAlterOwner = can(membership, PERMISSIONS.COMPANY_TRANSFER);
                  const manageable =
                    !isYou && (member.role !== COMPANY_ROLES.OWNER || mayAlterOwner);
                  const busy = busyId === member.id;

                  return (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-4"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-brand-dark">
                          {nameOf(member)}
                          {isYou && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                        </span>
                        {member.user?.name && (
                          <span className="block truncate text-xs text-gray-500">
                            {member.user.email}
                          </span>
                        )}
                        {member.joinedAt && (
                          <span className="block text-xs text-gray-400">
                            Joined {formatWhen(member.joinedAt)}
                          </span>
                        )}
                      </span>

                      {manageable ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`role-${member.id}`}>
                            Role for {nameOf(member)}
                          </label>
                          <SelectInput
                            id={`role-${member.id}`}
                            name={`role-${member.id}`}
                            options={memberRoleOptions(member.role)}
                            value={member.role}
                            disabled={busy}
                            onChange={(event) => updateRole(member, event.target.value)}
                          />

                          {mayAlterOwner && member.role !== COMPANY_ROLES.OWNER && (
                            <Button
                              type="button"
                              variant="outlineDark"
                              size="sm"
                              disabled={busy}
                              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                              onClick={() => setConfirming({ kind: 'transfer', member })}
                            >
                              Make owner
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="outlineDark"
                            size="sm"
                            disabled={busy}
                            className="!border-red-200 !text-red-700 hover:!bg-red-50"
                            onClick={() => setConfirming({ kind: 'remove', member })}
                          >
                            Remove
                          </Button>
                        </span>
                      ) : (
                        <Badge tone="successLight" size="sm" radius="full">
                          {COMPANY_ROLE_LABELS[member.role] ?? member.role}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      )}

      {/*
        Removal and transfer both change someone's access in a way the clicker cannot undo alone —
        a removed member has to be re-invited, and a former owner cannot take ownership back
        without the new owner's cooperation. Both are confirmed; role changes are not, because
        they are reversible from this same screen.
      */}
      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={confirming?.kind === 'transfer' ? 'Transfer ownership' : 'Remove member'}
        description={
          confirming?.kind === 'transfer'
            ? `${nameOf(confirming?.member ?? {})} becomes the owner of this company. You stay on as an admin, and only they can transfer it back.`
            : `${nameOf(confirming?.member ?? {})} loses access to this company immediately. Their history is kept, and you can invite them again later.`
        }
      >
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={Boolean(busyId)}
            onClick={() =>
              confirming?.kind === 'transfer'
                ? confirmTransfer(confirming.member)
                : confirmRemove(confirming.member)
            }
          >
            {confirming?.kind === 'transfer' ? 'Transfer ownership' : 'Remove member'}
          </Button>
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setConfirming(null)}
          >
            Keep as is
          </Button>
        </div>
      </Modal>

      <div className="mt-10">
        <Button
          to={buildPath(PATHS.COMPANY_HOME, { companySlug })}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          <Icon name="arrow-right" className="rotate-180 text-xs" />
          Back to company
        </Button>
      </div>
    </Container>
  );
}
