import { ValidationError } from "@chat-adapter/shared";
import { verifyLineWorksSignature } from "./signature";
import type { LineWorksCallbackPayload } from "./types";

export interface VerifiedLineWorksWebhook {
  payload: LineWorksCallbackPayload;
  rawBody: string;
}

export async function verifyLineWorksWebhook(
  request: Request,
  config: { botId: string; botSecret: string }
): Promise<VerifiedLineWorksWebhook> {
  const requestBotId = request.headers.get("X-WORKS-BotId");
  if (requestBotId !== config.botId) {
    throw new UnauthorizedLineWorksWebhookError("Invalid LINE WORKS bot ID");
  }

  const rawBody = await request.text();
  const signature = request.headers.get("X-WORKS-Signature");

  if (!verifyLineWorksSignature(rawBody, config.botSecret, signature)) {
    throw new UnauthorizedLineWorksWebhookError(
      "Invalid LINE WORKS callback signature"
    );
  }

  try {
    return {
      payload: JSON.parse(rawBody) as LineWorksCallbackPayload,
      rawBody,
    };
  } catch {
    throw new ValidationError("lineworks", "Invalid LINE WORKS callback JSON");
  }
}

export class UnauthorizedLineWorksWebhookError extends Error {}
