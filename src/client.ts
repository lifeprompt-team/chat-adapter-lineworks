import { NetworkError, ValidationError } from "@chat-adapter/shared";
import { mapLineWorksResponseError } from "./errors";
import { StaticLineWorksTokenProvider } from "./token-provider";
import type { LineWorksTokenProvider } from "./token-provider";
import type {
  LineWorksAttachmentUploadUrl,
  LineWorksChannel,
  LineWorksClientConfig,
  LineWorksCreateChannelResponse,
  LineWorksOutboundContent,
  LineWorksSendMessageResponse,
  LineWorksThreadId,
  LineWorksUploadedAttachment,
} from "./types";

const API_BASE_URL = "https://www.worksapis.com/v1.0";

export class LineWorksClient {
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: LineWorksTokenProvider;

  constructor(private readonly config: LineWorksClientConfig) {
    this.fetchImpl = config.fetch ?? fetch;
    const tokenProvider =
      config.accessTokenProvider ??
      (config.accessToken ? new StaticLineWorksTokenProvider(config.accessToken) : undefined);
    if (!tokenProvider) {
      throw new ValidationError(
        "lineworks",
        "accessToken or accessTokenProvider is required"
      );
    }
    this.tokenProvider = tokenProvider;
  }

  async sendUserMessage(
    userId: string,
    text: string
  ): Promise<LineWorksSendMessageResponse> {
    return this.sendUserContent(userId, {
      text,
      type: "text",
    });
  }

  async sendUserContent(
    userId: string,
    content: LineWorksOutboundContent
  ): Promise<LineWorksSendMessageResponse> {
    const destination: LineWorksThreadId = { kind: "user", userId };
    return this.sendMessage(
      `/bots/${encodeURIComponent(this.config.botId)}/users/${encodeURIComponent(
        userId
      )}/messages`,
      content,
      destination
    );
  }

  async sendChannelMessage(
    channelId: string,
    text: string
  ): Promise<LineWorksSendMessageResponse> {
    return this.sendChannelContent(channelId, {
      text,
      type: "text",
    });
  }

  async sendChannelContent(
    channelId: string,
    content: LineWorksOutboundContent
  ): Promise<LineWorksSendMessageResponse> {
    const destination: LineWorksThreadId = { channelId, kind: "channel" };
    return this.sendMessage(
      `/bots/${encodeURIComponent(
        this.config.botId
      )}/channels/${encodeURIComponent(channelId)}/messages`,
      content,
      destination
    );
  }

  async getChannel(channelId: string): Promise<LineWorksChannel> {
    return this.requestJson<LineWorksChannel>({
      method: "GET",
      path: `/bots/${encodeURIComponent(this.config.botId)}/channels/${encodeURIComponent(
        channelId
      )}`,
      validStatuses: [200],
    });
  }

  async listChannelMembers(channelId: string): Promise<string[]> {
    const members: string[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        count: "100",
      });
      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await this.requestJson<{
        members?: unknown;
        responseMetaData?: { nextCursor?: unknown };
      }>({
        method: "GET",
        path: `/bots/${encodeURIComponent(
          this.config.botId
        )}/channels/${encodeURIComponent(channelId)}/members?${params.toString()}`,
        validStatuses: [200],
      });

      if (Array.isArray(response.members)) {
        for (const member of response.members) {
          if (typeof member === "string") {
            members.push(member);
          }
        }
      }

      const nextCursor = response.responseMetaData?.nextCursor;
      cursor = typeof nextCursor === "string" && nextCursor.length > 0 ? nextCursor : undefined;
    } while (cursor);

    return members;
  }

  async createChannel(options: {
    members: readonly string[];
    title?: string;
  }): Promise<LineWorksCreateChannelResponse> {
    return this.requestJson<LineWorksCreateChannelResponse>({
      body: {
        members: options.members,
        ...(options.title ? { title: options.title } : {}),
      },
      method: "POST",
      path: `/bots/${encodeURIComponent(this.config.botId)}/channels`,
      validStatuses: [201],
    });
  }

  async createAttachment(options: {
    fileName: string;
  }): Promise<LineWorksAttachmentUploadUrl> {
    return this.requestJson<LineWorksAttachmentUploadUrl>({
      body: {
        fileName: options.fileName,
      },
      method: "POST",
      path: `/bots/${encodeURIComponent(this.config.botId)}/attachments`,
      validStatuses: [200],
    });
  }

  async uploadAttachment(options: {
    data: Blob | Buffer | ArrayBuffer;
    fileName: string;
    mimeType?: string;
    uploadUrl: string;
  }): Promise<LineWorksUploadedAttachment> {
    const formData = new FormData();
    formData.set("resourceName", options.fileName);
    formData.set(
      "FileData",
      toUploadBlob({
        data: options.data,
        mimeType: options.mimeType,
      }),
      options.fileName
    );

    const response = await this.request({
      absoluteUrl: options.uploadUrl,
      body: formData,
      method: "POST",
      validStatuses: [200, 201],
    });

    return (await readJsonOrNull(response)) as LineWorksUploadedAttachment;
  }

  async getAttachmentDownloadUrl(fileId: string): Promise<string> {
    const response = await this.request({
      method: "GET",
      path: `/bots/${encodeURIComponent(this.config.botId)}/attachments/${encodeURIComponent(
        fileId
      )}`,
      redirect: "manual",
      validStatuses: [302],
    });
    const location = response.headers.get("location");
    if (!location) {
      throw new ValidationError(
        "lineworks",
        `LINE WORKS attachment ${fileId} did not return a download URL`
      );
    }
    return location;
  }

  async downloadAttachmentData(fileId: string): Promise<Buffer> {
    const downloadUrl = await this.getAttachmentDownloadUrl(fileId);
    const response = await this.request({
      absoluteUrl: downloadUrl,
      method: "GET",
      validStatuses: [200],
    });
    return Buffer.from(await response.arrayBuffer());
  }

  private async sendMessage(
    path: string,
    content: LineWorksOutboundContent,
    destination: LineWorksThreadId
  ): Promise<LineWorksSendMessageResponse> {
    const response = await this.request({
      body: {
        content,
      },
      method: "POST",
      path,
      validStatuses: [201],
    });

    return {
      body: await readJsonOrNull(response),
      destination,
      status: response.status,
    };
  }

  private async requestJson<T>(options: {
    body?: unknown;
    method: string;
    path: string;
    validStatuses: readonly number[];
  }): Promise<T> {
    const response = await this.request(options);
    return (await readJsonOrNull(response)) as T;
  }

  private async request(options: {
    absoluteUrl?: string;
    body?: BodyInit | unknown;
    method: string;
    path?: string;
    redirect?: RequestRedirect;
    validStatuses: readonly number[];
  }): Promise<Response> {
    const url = options.absoluteUrl ?? `${API_BASE_URL}${options.path}`;
    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        body: serializeBody(options.body),
        headers: await this.buildHeaders(options.body),
        method: options.method,
        redirect: options.redirect,
      });
    } catch (error) {
      throw new NetworkError(
        "lineworks",
        "Failed to call LINE WORKS Bot API",
        error instanceof Error ? error : undefined
      );
    }

    if (!options.validStatuses.includes(response.status)) {
      throw await mapLineWorksResponseError(response, options.path ?? url);
    }

    return response;
  }

  private async buildHeaders(body: BodyInit | unknown): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.tokenProvider.getAccessToken()}`,
    };
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }
}

function serializeBody(body: BodyInit | unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }
  return JSON.stringify(body);
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

function toUploadBlob(options: {
  data: Blob | Buffer | ArrayBuffer;
  mimeType?: string;
}): Blob {
  if (options.data instanceof Blob) {
    return options.data;
  }
  if (Buffer.isBuffer(options.data)) {
    return new Blob([Uint8Array.from(options.data)], {
      type: options.mimeType ?? "application/octet-stream",
    });
  }
  return new Blob([options.data], {
    type: options.mimeType ?? "application/octet-stream",
  });
}
