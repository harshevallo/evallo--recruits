import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PERMISSIONS } from '@evallo/shared';
import { Button, Icon } from '@/components/ui';
import { useCompany } from '@/context/CompanyContext';
import { PATHS, buildPath } from '@/router/paths';
import { StartConversationModal } from './StartConversationModal';

/**
 * "Message" for a candidate, from any recruiter screen (ADR-025).
 *
 * The interest inbox, the shortlist, the pipeline board, talent search and the candidate viewer all
 * show a candidate the recruiter might want to write to, and each used to invent its own way of
 * getting there — or, more often, none. This is the one way: a button that opens the shared
 * composer, starts (or continues) the person-to-person conversation through the active company,
 * and lands the recruiter in the thread.
 *
 * Renders nothing when the caller lacks `message:send` at this company, mirroring what the API
 * would refuse — a button that only produces an error is worse than no button.
 *
 * @param {string} candidateId   The candidate PROFILE id, as every recruiter surface knows it
 * @param {string} [candidateName]
 */
export function MessageCandidateButton({
  candidateId,
  candidateName,
  companySlug,
  variant = 'outline',
  size = 'sm',
  radius = 'lg',
  className,
  children,
}) {
  const { can, activeCompany } = useCompany();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!candidateId || !can(PERMISSIONS.MESSAGE_SEND)) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        radius={radius}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Icon name="comments" className="text-xs" />
        {children ?? 'Message'}
        {candidateName && <span className="sr-only"> {candidateName}</span>}
      </Button>

      <StartConversationModal
        open={open}
        onClose={() => setOpen(false)}
        recipientName={candidateName}
        recipient={{ candidateId }}
        companyId={companySlug}
        companyName={activeCompany?.name}
        onSent={(result) =>
          navigate(
            `${buildPath(PATHS.COMPANY_MESSAGES, { companySlug })}?conversation=${result.conversationId}`,
          )
        }
      />
    </>
  );
}
