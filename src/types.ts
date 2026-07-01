import type { Logger } from "chat";
import type { LineWorksTokenProvider } from "./token-provider";

export type LineWorksThreadKind = "user" | "channel";

export type LineWorksThreadId =
  | { domainId?: number | string; kind: "user"; userId: string }
  | { channelId: string; domainId?: number | string; kind: "channel" };

export interface LineWorksAdapterConfig {
  accessToken?: string;
  accessTokenProvider?: LineWorksTokenProvider;
  botId: string;
  botSecret: string;
  fetch?: typeof fetch;
  logger?: Logger;
  treatChannelMessagesAsMentions?: boolean;
  /** Bot display name used to detect `@Bot Name` plain-text mentions in channel messages. */
  userName?: string;
}

export interface LineWorksClientConfig {
  accessToken?: string;
  accessTokenProvider?: LineWorksTokenProvider;
  botId: string;
  fetch?: typeof fetch;
}

export type LineWorksMessageContent =
  | { postback?: string; text: string; type: "text" }
  | {
      fileId?: string;
      originalContentUrl?: string;
      previewImageUrl?: string;
      type: "image" | "file" | "audio" | "video";
    }
  | { type: "location" | "sticker" }
  | { [key: string]: unknown; type: string };

export interface LineWorksEventSource {
  channelId?: string;
  domainId?: number | string;
  userId: string;
}

export interface LineWorksMessageEvent {
  content: LineWorksMessageContent;
  issuedTime: number | string;
  source: LineWorksEventSource;
  type: "message";
}

export interface LineWorksPostbackEvent {
  data: string;
  issuedTime: number | string;
  source: LineWorksEventSource;
  type: "postback";
}

export type LineWorksCallbackPayload =
  | LineWorksMessageEvent
  | LineWorksPostbackEvent
  | ({ type: string } & Record<string, unknown>);

export interface LineWorksSendMessageResponse {
  body: unknown;
  destination: LineWorksThreadId;
  status: number;
}

export type LineWorksOutboundContent =
  | { text: string; type: "text" }
  | {
      actions: LineWorksTemplateAction[];
      contentText: string;
      type: "button_template";
    }
  | { fileId: string; type: "image" }
  | { fileId: string; type: "file" };

export type LineWorksTemplateAction =
  | {
      label: string;
      postback: string;
      type: "message";
    }
  | {
      label: string;
      type: "uri";
      uri: string;
    };

export interface LineWorksChannel {
  channelId: string;
  channelType?: {
    groupId?: string;
    orgUnitId?: string;
    type?: "SINGLE_USER" | "MULTI_USERS" | "GROUP" | string;
  };
  domainId?: number;
  title?: string;
}

export interface LineWorksCreateChannelResponse {
  channelId: string;
  title?: string;
}

export interface LineWorksAttachmentUploadUrl {
  fileId: string;
  uploadUrl: string;
}

export interface LineWorksUploadedAttachment {
  fileId: string;
  fileName?: string;
  fileSize?: number | string;
}
