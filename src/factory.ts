import { ValidationError } from "@chat-adapter/shared";
import type { Logger } from "chat";
import { LineWorksAdapter } from "./adapter";
import type { LineWorksAdapterConfig } from "./types";

export function createLineWorksAdapter(
  config: Partial<LineWorksAdapterConfig> & { logger?: Logger } = {}
): LineWorksAdapter {
  const botId = config.botId ?? process.env.LINEWORKS_BOT_ID;
  const botSecret = config.botSecret ?? process.env.LINEWORKS_BOT_SECRET;
  const accessToken = config.accessToken ?? process.env.LINEWORKS_ACCESS_TOKEN;
  const userName =
    config.userName ?? process.env.LINEWORKS_BOT_USER_NAME ?? "lineworks-bot";

  if (!botId) {
    throw new ValidationError(
      "lineworks",
      "LINE WORKS bot ID is required. Pass botId or set LINEWORKS_BOT_ID."
    );
  }

  if (!botSecret) {
    throw new ValidationError(
      "lineworks",
      "LINE WORKS bot secret is required. Pass botSecret or set LINEWORKS_BOT_SECRET."
    );
  }

  if (!accessToken) {
    throw new ValidationError(
      "lineworks",
      "LINE WORKS access token is required. Pass accessToken or set LINEWORKS_ACCESS_TOKEN."
    );
  }

  return new LineWorksAdapter({
    accessToken,
    botId,
    botSecret,
    logger: config.logger,
    treatChannelMessagesAsMentions: config.treatChannelMessagesAsMentions,
    userName,
  });
}
