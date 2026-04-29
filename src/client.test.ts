import { describe, expect, it, vi } from "vitest";
import { AuthenticationError, ValidationError } from "@chat-adapter/shared";
import { LineWorksClient } from "./client";

describe("LineWorksClient", () => {
  it("sends user text messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await client.sendUserMessage("user-1", "hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.worksapis.com/v1.0/bots/bot-id/users/user-1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          content: { text: "hello", type: "text" },
        }),
        method: "POST",
      })
    );
  });

  it("sends channel text messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await client.sendChannelMessage("channel-1", "hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.worksapis.com/v1.0/bots/bot-id/channels/channel-1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          content: { text: "hello", type: "text" },
        }),
        method: "POST",
      })
    );
  });

  it("maps 400 responses to validation errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await expect(client.sendUserMessage("user-1", "hello")).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("maps 401 responses to authentication errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 401 }));
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await expect(client.sendUserMessage("user-1", "hello")).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });
});
