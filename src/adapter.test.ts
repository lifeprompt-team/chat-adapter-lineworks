import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@chat-adapter/shared";
import { Actions, Button, Card, CardText, LinkButton } from "chat";
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

function createChat(args?: {
  processAction?: ReturnType<typeof vi.fn>;
  processMessage?: ReturnType<typeof vi.fn>;
}): ChatInstance {
  return {
    getLogger: () => logger,
    getState: () => ({}) as StateAdapter,
    getUserName: () => "lineworks-bot",
    handleIncomingMessage: vi.fn(),
    processAction: args?.processAction ?? vi.fn(),
    processAppHomeOpened: vi.fn(),
    processAssistantContextChanged: vi.fn(),
    processAssistantThreadStarted: vi.fn(),
    processMemberJoinedChannel: vi.fn(),
    processMessage: args?.processMessage ?? vi.fn(),
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

  it("treats channel messages with bot mention tag as mentions", () => {
    const adapter = createAdapter({ botUserId: "bot-user" });
    const event: LineWorksMessageEvent = {
      content: {
        text: 'hello <m userId="bot-user"> help me',
        type: "text",
      },
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
    await adapter.initialize(createChat({ processMessage }));

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

  it("processes inbound file messages as lazy attachments", async () => {
    const processMessage = vi.fn();
    const adapter = createAdapter();
    await adapter.initialize(createChat({ processMessage }));

    const body = JSON.stringify({
      content: { fileId: "file-1", type: "image" },
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
    const message = processMessage.mock.calls[0]?.[2];
    expect(message.attachments).toMatchObject([
      {
        name: "lineworks-file-1",
        type: "image",
      },
    ]);
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

  it("posts uploaded files as LINE WORKS file messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            uploadUrl: "https://upload.example.com/file",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            fileName: "document.pdf",
            fileSize: 10,
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response("", { status: 201 }));
    const adapter = createAdapter({ fetch: fetchMock });

    await adapter.postMessage(adapter.encodeThreadId({ kind: "user", userId: "user-1" }), {
      files: [
        {
          data: Buffer.from("file"),
          filename: "document.pdf",
          mimeType: "application/pdf",
        },
      ],
      raw: "see attached",
    });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: { text: "see attached", type: "text" },
    });
    expect(JSON.parse(fetchMock.mock.calls[3]?.[1]?.body as string)).toEqual({
      content: { fileId: "file-1", type: "file" },
    });
  });

  it("posts multi-line plain text preserving content.text newlines", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const adapter = createAdapter({ fetch: fetchMock });
    const text = ["line1", "", "line2", "- item"].join("\n");

    await adapter.postMessage(
      adapter.encodeThreadId({ channelId: "channel-1", kind: "channel" }),
      text
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: { text, type: "text" },
    });
  });

  it("posts multi-line raw text preserving content.text newlines", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const adapter = createAdapter({ fetch: fetchMock });
    const text = "1行目\n\n2行目";

    await adapter.postMessage(
      adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
      { raw: text }
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: { text, type: "text" },
    });
  });

  it("posts markdown messages as plain text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const adapter = createAdapter({ fetch: fetchMock });

    await adapter.postMessage(
      adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
      { markdown: "**bold** text" }
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: { text: "bold text", type: "text" },
    });
  });

  it("rejects outbound text over 2000 characters", async () => {
    const adapter = createAdapter();
    const text = "a".repeat(2001);

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
        text
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects button templates with more than 10 actions", async () => {
    const adapter = createAdapter();
    const buttons = Array.from({ length: 11 }, (_value, index) =>
      Button({ id: `action-${index}`, label: `Action ${index}` })
    );

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
        Card({
          title: "Too many actions",
          children: [Actions(buttons)],
        })
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining("10 actions"),
    });
  });

  it("rejects button templates with content text over 1000 characters", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
        Card({
          title: "a".repeat(1001),
          children: [
            Actions([Button({ id: "approve", label: "Approve" })]),
          ],
        })
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining("1000 characters or fewer"),
    });
  });

  it("rejects button templates with labels over 20 characters", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
        Card({
          title: "Long label",
          children: [
            Actions([
              Button({
                id: "approve",
                label: "a".repeat(21),
              }),
            ]),
          ],
        })
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining("20 characters or fewer"),
    });
  });

  it("rejects button templates with message action postback over 1000 characters", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
        Card({
          title: "Long postback",
          children: [
            Actions([
              Button({
                id: "approve",
                label: "Approve",
                value: "a".repeat(1000),
              }),
            ]),
          ],
        })
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining("1000 characters or fewer"),
    });
  });

  it("excludes disabled buttons from button templates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const adapter = createAdapter({ fetch: fetchMock });

    await adapter.postMessage(
      adapter.encodeThreadId({ kind: "user", userId: "user-1" }),
      Card({
        title: "Actions",
        children: [
          Actions([
            Button({ id: "enabled", label: "OK" }),
            Button({ disabled: true, id: "disabled", label: "No" }),
          ]),
        ],
      })
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: {
        actions: [
          {
            label: "OK",
            postback: "enabled",
            type: "message",
          },
        ],
        contentText: "Actions",
        type: "button_template",
      },
    });
  });

  it("posts Chat SDK cards with buttons as LINE WORKS button templates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const adapter = createAdapter({ fetch: fetchMock });

    await adapter.postMessage(
      adapter.encodeThreadId({ channelId: "channel-1", kind: "channel" }),
      Card({
        title: "Pending",
        children: [
          CardText("Approve this?"),
          Actions([
            Button({ id: "approve", label: "Approve", value: "pending-1" }),
            LinkButton({ label: "Details", url: "https://example.com/cases/case-1" }),
          ]),
        ],
      })
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: {
        actions: [
          {
            label: "Approve",
            postback: "approve\npending-1",
            type: "message",
          },
          {
            label: "Details",
            type: "uri",
            uri: "https://example.com/cases/case-1",
          },
        ],
        contentText: "Pending\nApprove this?",
        type: "button_template",
      },
    });
  });

  it("processes message action postbacks from message callbacks as Chat SDK actions", async () => {
    const processAction = vi.fn();
    const processMessage = vi.fn();
    const adapter = createAdapter();
    await adapter.initialize(createChat({ processAction, processMessage }));

    const body = JSON.stringify({
      content: {
        postback: "approve\npending-1",
        text: "Approve",
        type: "text",
      },
      issuedTime: "2026-04-29T00:00:00Z",
      source: {
        channelId: "channel-1",
        userId: "user-1",
      },
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
    expect(processAction).toHaveBeenCalledTimes(1);
    expect(processMessage).not.toHaveBeenCalled();
    expect(processAction.mock.calls[0]?.[0]).toMatchObject({
      actionId: "approve",
      threadId: adapter.encodeThreadId({
        channelId: "channel-1",
        kind: "channel",
      }),
      user: {
        userId: "user-1",
      },
      value: "pending-1",
    });
  });

  it("processes postback callbacks as Chat SDK actions", async () => {
    const processAction = vi.fn();
    const adapter = createAdapter();
    await adapter.initialize(createChat({ processAction }));

    const body = JSON.stringify({
      data: "approve\npending-1",
      issuedTime: "2026-04-29T00:00:00Z",
      source: {
        channelId: "channel-1",
        userId: "user-1",
      },
      type: "postback",
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
    expect(processAction).toHaveBeenCalledTimes(1);
    expect(processAction.mock.calls[0]?.[0]).toMatchObject({
      actionId: "approve",
      threadId: adapter.encodeThreadId({
        channelId: "channel-1",
        kind: "channel",
      }),
      user: {
        userId: "user-1",
      },
      value: "pending-1",
    });
  });

  it("treats typing and reactions as no-op", async () => {
    const adapter = createAdapter();

    await expect(adapter.startTyping()).resolves.toBeUndefined();
    await expect(adapter.addReaction()).resolves.toBeUndefined();
    await expect(adapter.removeReaction("thread", "message", "thumbsup")).resolves.toBeUndefined();
  });
});
