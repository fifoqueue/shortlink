import type { WhereOptions } from 'sequelize';
import type { LinkOwner } from './link-owner';

type OwnedLink = {
  creatorUserId: number | null;
  creatorSessionId: string | null;
};

// IP addresses identify a network, never a person or a browser.
export function linkMatchesOwner(link: OwnedLink, owner: LinkOwner) {
  if (owner.userId) return link.creatorUserId === owner.userId;
  return Boolean(
    !link.creatorUserId &&
    owner.sessionId &&
    link.creatorSessionId === owner.sessionId,
  );
}

export function ownerWhere(owner: LinkOwner): WhereOptions {
  if (owner.userId) return { creatorUserId: owner.userId };
  if (owner.sessionId)
    return { creatorUserId: null, creatorSessionId: owner.sessionId };
  return { id: -1 };
}
