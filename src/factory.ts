import { ValidationError } from "@chat-adapter/shared";
import type { Logger } from "chat";
import { LineWorksAdapter } from "./adapter";
import { ServiceAccountLineWorksTokenProvider } from "./token-provider";
import type { LineWorksAdapterConfig } from "./types";

export function createLineWorksAdapter(
  config: Partial<LineWorksAdapterConfig> & { logger?: Logger } = {}
): LineWorksAdapter {
  const botId = config.botId ?? process.env.LINEWORKS_BOT_ID;
  const botSecret = config.botSecret ?? process.env.LINEWORKS_BOT_SECRET;
  const accessToken = config.accessToken ?? process.env.LINEWORKS_ACCESS_TOKEN;
  const accessTokenProvider =
    config.accessTokenProvider ??
    (accessToken
      ? undefined
      : createServiceAccountTokenProviderFromEnv());
  const botUserId = config.botUserId ?? process.env.LINEWORKS_BOT_USER_ID;
  const userName =
    config.userName ?? process.env.LINEWORKS_BOT_USER_NAME ?? "lineworks-bot";
  const treatChannelMessagesAsMentions =
    config.treatChannelMessagesAsMentions ??
    process.env.LINEWORKS_TREAT_CHANNEL_MESSAGES_AS_MENTIONS === "true";

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

  if (!accessToken && !accessTokenProvider) {
    throw new ValidationError(
      "lineworks",
      "LINE WORKS access token is required. Pass accessToken, accessTokenProvider, or set LINEWORKS_ACCESS_TOKEN / service account environment variables."
    );
  }

  return new LineWorksAdapter({
    accessToken,
    accessTokenProvider,
    botId,
    botSecret,
    botUserId,
    fetch: config.fetch,
    logger: config.logger,
    treatChannelMessagesAsMentions,
    userName,
  });
}

function createServiceAccountTokenProviderFromEnv() {
  const clientId = process.env.LINEWORKS_CLIENT_ID;
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET;
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
  const privateKey = process.env.LINEWORKS_PRIVATE_KEY;
  const scopes = process.env.LINEWORKS_SCOPES;

  if (!clientId && !clientSecret && !serviceAccount && !privateKey && !scopes) {
    return undefined;
  }

  if (!clientId || !clientSecret || !serviceAccount || !privateKey || !scopes) {
    throw new ValidationError(
      "lineworks",
      "LINEWORKS_CLIENT_ID, LINEWORKS_CLIENT_SECRET, LINEWORKS_SERVICE_ACCOUNT, LINEWORKS_PRIVATE_KEY, and LINEWORKS_SCOPES are required for service account authentication."
    );
  }

  return new ServiceAccountLineWorksTokenProvider({
    clientId,
    clientSecret,
    privateKey,
    scopes,
    serviceAccount,
  });
}
