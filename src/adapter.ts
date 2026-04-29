import {
  extractFiles,
  ValidationError,
} from "@chat-adapter/shared";
import { createHash } from "node:crypto";
import {
  ConsoleLogger,
  Message,
  NotImplementedError,
  parseMarkdown,
  type Adapter,
  type AdapterPostableMessage,
  type ChatInstance,
  type EmojiValue,
  type FetchOptions,
  type FetchResult,
  type FormattedContent,
  type Logger,
  type RawMessage,
  type ThreadInfo,
  type WebhookOptions,
} from "chat";
import { LineWorksClient } from "./client";
import { LineWorksFormatConverter } from "./format-converter";
import { decodeThreadId, encodeThreadId } from "./thread-id";
import type {
  LineWorksAdapterConfig,
  LineWorksCallbackPayload,
  LineWorksMessageEvent,
  LineWorksSendMessageResponse,
  LineWorksThreadId,
} from "./types";
import {
  UnauthorizedLineWorksWebhookError,
  verifyLineWorksWebhook,
} from "./webhook";

const MAX_TEXT_LENGTH = 2000;

export class LineWorksAdapter
  implements Adapter<LineWorksThreadId, unknown>
{
  readonly name = "lineworks";
  readonly userName: string;

  private chat: ChatInstance | null = null;
  private readonly client: LineWorksClient;
  private readonly config: LineWorksAdapterConfig;
  private logger: Logger;
  private readonly converter = new LineWorksFormatConverter();

  constructor(config: LineWorksAdapterConfig) {
    validateConfig(config);
    this.config = config;
    this.userName = config.userName ?? "lineworks-bot";
    this.logger = config.logger ?? new ConsoleLogger();
    this.client = new LineWorksClient({
      accessToken: config.accessToken,
      botId: config.botId,
    });
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    this.logger = chat.getLogger("lineworks");
  }

  encodeThreadId(data: LineWorksThreadId): string {
    return encodeThreadId(data);
  }

  decodeThreadId(threadId: string): LineWorksThreadId {
    return decodeThreadId(threadId);
  }

  channelIdFromThreadId(threadId: string): string {
    const decoded = this.decodeThreadId(threadId);
    return decoded.kind === "channel" ? decoded.channelId : decoded.userId;
  }

  async handleWebhook(
    request: Request,
    options?: WebhookOptions
  ): Promise<Response> {
    let verified;

    try {
      verified = await verifyLineWorksWebhook(request, {
        botId: this.config.botId,
        botSecret: this.config.botSecret,
      });
    } catch (error) {
      if (error instanceof UnauthorizedLineWorksWebhookError) {
        return new Response("Unauthorized", { status: 401 });
      }

      if (error instanceof ValidationError) {
        return new Response(error.message, { status: 400 });
      }

      throw error;
    }

    if (verified.payload.type !== "message") {
      this.logger.debug("Ignoring unsupported LINE WORKS callback event", {
        type: verified.payload.type,
      });
      return new Response("OK", { status: 200 });
    }

    const event = verified.payload as LineWorksMessageEvent;
    if (event.content.type !== "text") {
      this.logger.warn("Ignoring unsupported LINE WORKS message type", {
        type: event.content.type,
      });
      return new Response("OK", { status: 200 });
    }

    const message = this.parseMessage(event);
    this.requireChat().processMessage(this, message.threadId, message, options);

    return new Response("OK", { status: 200 });
  }

  parseMessage(raw: unknown): Message<unknown> {
    if (!isLineWorksMessageEvent(raw)) {
      throw new ValidationError("lineworks", "Expected LINE WORKS message event");
    }

    const event = raw;
    const text = getEventText(event);
    const threadId = event.source.channelId
      ? this.encodeThreadId({
          channelId: event.source.channelId,
          domainId: event.source.domainId,
          kind: "channel",
        })
      : this.encodeThreadId({
          domainId: event.source.domainId,
          kind: "user",
          userId: event.source.userId,
        });

    const isChannelMessage = Boolean(event.source.channelId);

    return new Message<unknown>({
      attachments: [],
      author: {
        fullName: event.source.userId,
        isBot: "unknown",
        isMe: false,
        userId: event.source.userId,
        userName: event.source.userId,
      },
      formatted: parseMarkdown(text),
      id: createEventId(event),
      isMention: isChannelMessage
        ? this.config.treatChannelMessagesAsMentions === true
        : true,
      metadata: {
        dateSent: parseIssuedTime(event.issuedTime),
        edited: false,
      },
      raw,
      text,
      threadId,
    });
  }

  async postMessage(
    threadId: string,
    message: AdapterPostableMessage
  ): Promise<RawMessage<LineWorksSendMessageResponse>> {
    const files = extractFiles(message);
    if (files.length > 0) {
      throw new ValidationError(
        "lineworks",
        "LINE WORKS file uploads are not supported yet"
      );
    }

    const text = this.converter.renderPostable(message);
    if (text.length > MAX_TEXT_LENGTH) {
      throw new ValidationError(
        "lineworks",
        `LINE WORKS text messages must be ${MAX_TEXT_LENGTH} characters or fewer`
      );
    }

    const destination = this.decodeThreadId(threadId);
    const raw =
      destination.kind === "user"
        ? await this.client.sendUserMessage(destination.userId, text)
        : await this.client.sendChannelMessage(destination.channelId, text);

    return {
      id: createSentMessageId(),
      raw,
      threadId,
    };
  }

  async fetchMessages(
    _threadId: string,
    _options?: FetchOptions
  ): Promise<FetchResult<unknown>> {
    throw new NotImplementedError(
      "LINE WORKS message history is not supported",
      "fetchMessages"
    );
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const decoded = this.decodeThreadId(threadId);

    return {
      channelId:
        decoded.kind === "channel" ? decoded.channelId : decoded.userId,
      id: threadId,
      isDM: decoded.kind === "user",
      metadata: {
        lineworks: decoded,
      },
    };
  }

  isDM(threadId: string): boolean {
    return this.decodeThreadId(threadId).kind === "user";
  }

  async openDM(userId: string): Promise<string> {
    return this.encodeThreadId({ kind: "user", userId });
  }

  renderFormatted(content: FormattedContent): string {
    return this.converter.fromAst(content);
  }

  async addReaction(): Promise<void> {
    throw new NotImplementedError(
      "LINE WORKS reactions are not supported",
      "addReaction"
    );
  }

  async removeReaction(
    _threadId: string,
    _messageId: string,
    _emoji: EmojiValue | string
  ): Promise<void> {
    throw new NotImplementedError(
      "LINE WORKS reactions are not supported",
      "removeReaction"
    );
  }

  async editMessage(): Promise<RawMessage<unknown>> {
    throw new NotImplementedError(
      "LINE WORKS message editing is not supported",
      "editMessage"
    );
  }

  async deleteMessage(): Promise<void> {
    throw new NotImplementedError(
      "LINE WORKS message deletion is not supported",
      "deleteMessage"
    );
  }

  async startTyping(): Promise<void> {
    throw new NotImplementedError(
      "LINE WORKS typing indicators are not supported",
      "startTyping"
    );
  }

  private requireChat(): ChatInstance {
    if (!this.chat) {
      throw new ValidationError(
        "lineworks",
        "LineWorksAdapter is not initialized"
      );
    }

    return this.chat;
  }
}

function validateConfig(config: LineWorksAdapterConfig): void {
  if (!config.botId) {
    throw new ValidationError("lineworks", "botId is required");
  }

  if (!config.botSecret) {
    throw new ValidationError("lineworks", "botSecret is required");
  }

  if (!config.accessToken) {
    throw new ValidationError("lineworks", "accessToken is required");
  }
}

function parseIssuedTime(issuedTime: number | string): Date {
  const date =
    typeof issuedTime === "number" ? new Date(issuedTime) : new Date(issuedTime);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getEventText(event: LineWorksMessageEvent): string {
  return event.content.type === "text" && typeof event.content.text === "string"
    ? event.content.text
    : "";
}

function isLineWorksMessageEvent(value: unknown): value is LineWorksMessageEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "message" &&
    "source" in value &&
    typeof value.source === "object" &&
    value.source !== null &&
    "userId" in value.source &&
    typeof value.source.userId === "string" &&
    "content" in value &&
    typeof value.content === "object" &&
    value.content !== null &&
    "issuedTime" in value &&
    (typeof value.issuedTime === "string" ||
      typeof value.issuedTime === "number")
  );
}

function createEventId(event: LineWorksMessageEvent): string {
  const hashInput = JSON.stringify({
    channelId: event.source.channelId ?? null,
    content: event.content,
    issuedTime: event.issuedTime,
    type: event.type,
    userId: event.source.userId,
  });
  const hash = createHash("sha256").update(hashInput).digest("base64url");

  return `lineworks:evt:${hash}`;
}

function createSentMessageId(): string {
  return `lineworks:sent:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
}
