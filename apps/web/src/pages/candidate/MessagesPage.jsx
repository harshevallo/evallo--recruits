import { Button } from '@/components/ui';
import { ConversationsInbox } from '@/features/messaging/ConversationsInbox';
import { PATHS } from '@/router/paths';

/**
 * CAN-09 — messages, from the candidate workspace (PRD §8.2, §11.2; ADR-025).
 *
 * The inbox itself is `ConversationsInbox`, the same component the company workspace renders: a
 * conversation is between two people and belongs to both of them, so a person has ONE inbox
 * whichever workspace they open it from. What this page adds is only where "back" goes and how an
 * empty inbox explains itself to a candidate — including that they can start a conversation
 * themselves, with anyone listed on a company page.
 */
export function MessagesPage() {
  return (
    <ConversationsInbox
      backTo={PATHS.CANDIDATE_HOME}
      backLabel="Candidate home"
      description="Conversations with people at companies. Each one is between you and one person — you can reply, or start one from a company page."
      emptyDescription="Recruiters can write to you once your profile is discoverable or you have shared it with their company — and you can write first to anyone listed on a company page."
      emptyAction={
        <Button to={PATHS.CANDIDATE_COMPANIES} variant="primary" size="md">
          Browse companies
        </Button>
      }
    />
  );
}
