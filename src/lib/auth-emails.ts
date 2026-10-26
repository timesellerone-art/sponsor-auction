type EmailIdentity = {
  email?: string | null;
  identity_data?: Record<string, unknown> | null;
};

type EmailUserLike = {
  email?: string | null;
  identities?: EmailIdentity[] | null;
  user_metadata?: Record<string, unknown> | null;
};

function asEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim().toLowerCase();
  if (!email.includes('@') || email.endsWith('@oauth.sponsor-auction.local')) {
    return null;
  }
  return email;
}

export function collectAuthEmails(user: EmailUserLike | null | undefined): string[] {
  if (!user) {
    return [];
  }

  const emails = new Set<string>();
  const direct = asEmail(user.email);
  if (direct) {
    emails.add(direct);
  }

  const metaEmail = asEmail(user.user_metadata?.email);
  if (metaEmail) {
    emails.add(metaEmail);
  }

  for (const identity of user.identities ?? []) {
    const fromIdentity = asEmail(identity.email) ?? asEmail(identity.identity_data?.email);
    if (fromIdentity) {
      emails.add(fromIdentity);
    }
  }

  return [...emails];
}
