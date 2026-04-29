import type { Logger } from "chat";

export type LineWorksThreadKind = "user" | "channel";

export type LineWorksThreadId =
  | { domainId?: number | string; kind: "user"; userId: string }
  | { channelId: string; domainId?: number | string; kind: "channel" };

export interface LineWorksAdapterConfig {
  accessToken: string;
  botId: string;
  botSecret: string;
  logger?: Logger;
  treatChannelMessagesAsMentions?: boolean;
  userName?: string;
}

export interface LineWorksClientConfig {
  accessToken: string;
  botId: string;
  fetch?: typeof fetch;
}

export type LineWorksMessageContent =
  | { text: string; type: "text" }
  | { type: "image" | "file" | "audio" | "video" | "location" | "sticker" }
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
