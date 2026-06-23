import { describe, expect, it, vi } from "vitest";
import { AuthenticationError, ValidationError } from "@chat-adapter/shared";
import { LineWorksClient } from "./client";
import { StaticLineWorksTokenProvider } from "./token-provider";

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
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    });
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

  it("accepts an access token provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    const client = new LineWorksClient({
      accessTokenProvider: new StaticLineWorksTokenProvider("provider-token"),
      botId: "bot-id",
      fetch: fetchMock,
    });

    await client.sendUserMessage("user-1", "hello");

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer provider-token",
    });
  });

  it("gets channel details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          channelId: "channel-1",
          channelType: { type: "MULTI_USERS" },
          domainId: 100,
          title: "Room",
        }),
        { status: 200 }
      )
    );
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await expect(client.getChannel("channel-1")).resolves.toMatchObject({
      channelId: "channel-1",
      channelType: { type: "MULTI_USERS" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.worksapis.com/v1.0/bots/bot-id/channels/channel-1",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("lists channel members across pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            members: ["user-1"],
            responseMetaData: { nextCursor: "next" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            members: ["user-2"],
            responseMetaData: { nextCursor: "" },
          }),
          { status: 200 }
        )
      );
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await expect(client.listChannelMembers("channel-1")).resolves.toEqual([
      "user-1",
      "user-2",
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("count=100");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("cursor=next");
  });

  it("creates and uploads attachments", async () => {
    const fetchMock = vi
      .fn()
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
            fileName: "image.png",
            fileSize: 10,
          }),
          { status: 201 }
        )
      );
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    const upload = await client.createAttachment({ fileName: "image.png" });
    await expect(
      client.uploadAttachment({
        data: Buffer.from("image"),
        fileName: "image.png",
        mimeType: "image/png",
        uploadUrl: upload.uploadUrl,
      })
    ).resolves.toMatchObject({ fileId: "file-1" });

    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://upload.example.com/file");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeInstanceOf(FormData);
  });

  it("gets attachment download URLs without following redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("", {
        headers: { location: "https://download.example.com/file" },
        status: 302,
      })
    );
    const client = new LineWorksClient({
      accessToken: "token",
      botId: "bot-id",
      fetch: fetchMock,
    });

    await expect(client.getAttachmentDownloadUrl("file-1")).resolves.toBe(
      "https://download.example.com/file"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "manual",
    });
  });
});
