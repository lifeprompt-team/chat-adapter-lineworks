import { ValidationError } from "@chat-adapter/shared";
import type { LineWorksThreadId } from "./types";

const ADAPTER_NAME = "lineworks";

export function encodeThreadId(data: LineWorksThreadId): string {
  if (data.kind === "user") {
    return `${ADAPTER_NAME}:user:${encodeSegment(data.userId)}`;
  }

  if (data.kind === "channel") {
    return `${ADAPTER_NAME}:channel:${encodeSegment(data.channelId)}`;
  }

  throw new ValidationError(ADAPTER_NAME, "Invalid LINE WORKS thread ID data");
}

export function decodeThreadId(threadId: string): LineWorksThreadId {
  const [adapter, kind, encodedId, ...rest] = threadId.split(":");

  if (adapter !== ADAPTER_NAME || rest.length > 0 || !encodedId) {
    throw new ValidationError(
      ADAPTER_NAME,
      `Invalid LINE WORKS thread ID: ${threadId}`
    );
  }

  const id = decodeSegment(encodedId);

  if (kind === "user") {
    return { kind, userId: id };
  }

  if (kind === "channel") {
    return { channelId: id, kind };
  }

  throw new ValidationError(
    ADAPTER_NAME,
    `Invalid LINE WORKS thread kind: ${kind}`
  );
}

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeSegment(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch (error) {
    throw new ValidationError(
      ADAPTER_NAME,
      `Invalid base64url thread segment: ${String(error)}`
    );
  }
}
