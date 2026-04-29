import { NetworkError } from "@chat-adapter/shared";
import { mapLineWorksResponseError } from "./errors";
import type {
  LineWorksClientConfig,
  LineWorksSendMessageResponse,
  LineWorksThreadId,
} from "./types";

const API_BASE_URL = "https://www.worksapis.com/v1.0";

export class LineWorksClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: LineWorksClientConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  async sendUserMessage(
    userId: string,
    text: string
  ): Promise<LineWorksSendMessageResponse> {
    const destination: LineWorksThreadId = { kind: "user", userId };
    return this.sendMessage(
      `/bots/${encodeURIComponent(this.config.botId)}/users/${encodeURIComponent(
        userId
      )}/messages`,
      text,
      destination
    );
  }

  async sendChannelMessage(
    channelId: string,
    text: string
  ): Promise<LineWorksSendMessageResponse> {
    const destination: LineWorksThreadId = { channelId, kind: "channel" };
    return this.sendMessage(
      `/bots/${encodeURIComponent(
        this.config.botId
      )}/channels/${encodeURIComponent(channelId)}/messages`,
      text,
      destination
    );
  }

  private async sendMessage(
    path: string,
    text: string,
    destination: LineWorksThreadId
  ): Promise<LineWorksSendMessageResponse> {
    let response: Response;

    try {
      response = await this.fetchImpl(`${API_BASE_URL}${path}`, {
        body: JSON.stringify({
          content: {
            text,
            type: "text",
          },
        }),
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    } catch (error) {
      throw new NetworkError(
        "lineworks",
        "Failed to call LINE WORKS Bot API",
        error instanceof Error ? error : undefined
      );
    }

    if (response.status !== 201) {
      throw await mapLineWorksResponseError(response, path);
    }

    return {
      body: await readJsonOrNull(response),
      destination,
      status: response.status,
    };
  }
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
