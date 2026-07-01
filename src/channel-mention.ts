function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPlainTextBotMention(args: {
  botUserName: string;
  text: string;
}): boolean {
  const botUserName = args.botUserName.trim();
  if (!botUserName) {
    return false;
  }

  // @Bot Name の直後が空白・改行・文末であること（@AxMates Botany 等の誤爆を避ける）
  const usernamePattern = new RegExp(
    `@${escapeRegex(botUserName)}(?![\\S])`,
    "i",
  );
  return usernamePattern.test(args.text);
}

export function isLineWorksChannelMessageMention(args: {
  botUserName?: string;
  text: string;
  treatChannelMessagesAsMentions?: boolean;
}): boolean {
  if (args.treatChannelMessagesAsMentions === true) {
    return true;
  }

  return hasPlainTextBotMention({
    botUserName: args.botUserName ?? "",
    text: args.text,
  });
}
