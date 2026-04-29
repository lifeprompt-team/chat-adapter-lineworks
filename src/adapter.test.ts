import { describe, expect, it, vi } from "vitest";
import type { ChatInstance, Logger, StateAdapter } from "chat";
import { LineWorksAdapter } from "./adapter";
import { createLineWorksSignature } from "./signature";
import type { LineWorksMessageEvent } from "./types";

const logger: Logger = {
  child: () => logger,
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

function createChat(processMessage = vi.fn()): ChatInstance {
  return {
    getLogger: () => logger,
    getState: () => ({}) as StateAdapter,
    getUserName: () => "lineworks-bot",
    handleIncomingMessage: vi.fn(),
    processAction: vi.fn(),
    processAppHomeOpened: vi.fn(),
    processAssistantContextChanged: vi.fn(),
    processAssistantThreadStarted: vi.fn(),
    processMemberJoinedChannel: vi.fn(),
    processMessage,
    processModalClose: vi.fn(),
    processModalSubmit: vi.fn(),
    processReaction: vi.fn(),
    processSlashCommand: vi.fn(),
  };
}

function createAdapter(config = {}) {
  return new LineWorksAdapter({
    accessToken: "access-token",
    botId: "bot-id",
    botSecret: "bot-secret",
    logger,
    ...config,
  });
}

describe("LineWorksAdapter", () => {
  it("parses a text DM as a mention", () => {
    const adapter = createAdapter();
    const event: LineWorksMessageEvent = {
      content: { text: "hello", type: "text" },
      issuedTime: "2026-04-29T00:00:00Z",
      source: {
        domainId: 123,
        userId: "user-1",
      },
      type: "message",
    };

    const message = adapter.parseMessage(event);

    expect(message.text).toBe("hello");
    expect(message.threadId).toBe(adapter.encodeThreadId({
      kind: "user",
      userId: "user-1",
    }));
    expect(message.isMention).toBe(true);
    expect(message.metadata.dateSent.toISOString()).toBe(
      "2026-04-29T00:00:00.000Z"
    );
  });

  it("does not treat channel messages as mentions by default", () => {
    const adapter = createAdapter();
    const event: LineWorksMessageEvent = {
      content: { text: "hello", type: "text" },
      issuedTime: "2026-04-29T00:00:00Z",
      source: {
        channelId: "channel-1",
        domainId: 123,
        userId: "user-1",
      },
      type: "message",
    };

    expect(adapter.parseMessage(event).isMention).toBe(false);
  });

  it("can treat channel messages as mentions", () => {
    const adapter = createAdapter({ treatChannelMessagesAsMentions: true });
    const event: LineWorksMessageEvent = {
      content: { text: "hello", type: "text" },
      issuedTime: "2026-04-29T00:00:00Z",
      source: {
        channelId: "channel-1",
        domainId: 123,
        userId: "user-1",
      },
      type: "message",
    };

    expect(adapter.parseMessage(event).isMention).toBe(true);
  });

  it("verifies webhook signatures and processes text messages", async () => {
    const processMessage = vi.fn();
    const adapter = createAdapter();
    await adapter.initialize(createChat(processMessage));

    const body = JSON.stringify({
      content: { text: "hello", type: "text" },
      issuedTime: "2026-04-29T00:00:00Z",
      source: { userId: "user-1" },
      type: "message",
    });

    const response = await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        body,
        headers: {
          "X-WORKS-BotId": "bot-id",
          "X-WORKS-Signature": createLineWorksSignature(body, "bot-secret"),
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(processMessage).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid webhook signatures", async () => {
    const adapter = createAdapter();
    await adapter.initialize(createChat());

    const response = await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        body: "{}",
        headers: {
          "X-WORKS-BotId": "bot-id",
          "X-WORKS-Signature": "bad",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
  });
});
