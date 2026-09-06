import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useCompany } from '@/context/CompanyContext';
import { ConversationsInbox } from '@/features/messaging/ConversationsInbox';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-15 — messages, from the company workspace (PRD §7.6, §11.2; ADR-025).
 *
 * The same `ConversationsInbox` the candidate workspace renders, because it is the same inbox: a
 * conversation belongs to the two people in it, not to the company. Threads a recruiter opened from
 * this company's talent search sit here beside anything else they are part of, and colleagues do
 * not see each other's — an owner's Messages screen shows the owner's chats and nobody else's.
 *
 * The page adds only the back link into this workspace and an empty state that points at where a
 * recruiter starts conversations.
 */
export function CompanyMessagesPage() {
  const { companySlug } = useParams();
  const { can, activeCompany } = useCompany();
  const path = (name) => buildPath(name, { companySlug });

  return (
    <ConversationsInbox
      backTo={path(PATHS.COMPANY_HOME)}
      backLabel={activeCompany?.name ?? 'Company home'}
      description="Your conversations — the same inbox wherever you open it. Each one is between you and one other person; teammates cannot read yours, and you cannot read theirs."
      emptyDescription="Message a candidate from their profile or from talent search. Your first message shows your name and this company, and reaches them as a request until they reply."
      emptyAction={
        can('candidate:search') ? (
          <Button to={path(PATHS.COMPANY_SEARCH)} variant="primary" size="md">
            Find candidates
          </Button>
        ) : undefined
      }
    />
  );
}
