const LINEWORKS_MENTION_TAG_PATTERN = /<m\s+userId="([^"]*)"/g;

export function isLineWorksChannelMessageMention(args: {
  botUserId?: string;
  text: string;
  treatChannelMessagesAsMentions?: boolean;
}): boolean {
  if (args.treatChannelMessagesAsMentions === true) {
    return true;
  }

  const botUserId = args.botUserId?.trim();
  if (!botUserId) {
    return false;
  }

  for (const match of args.text.matchAll(LINEWORKS_MENTION_TAG_PATTERN)) {
    if (match[1]?.trim() === botUserId) {
      return true;
    }
  }

  return false;
}
