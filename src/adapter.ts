import { createHash } from "node:crypto";
import { extractFiles, ValidationError } from "@chat-adapter/shared";
import {
	type Adapter,
	type AdapterPostableMessage,
	type Attachment,
	type ChatInstance,
	ConsoleLogger,
	type EmojiValue,
	type FetchOptions,
	type FetchResult,
	type FormattedContent,
	type Logger,
	Message,
	NotImplementedError,
	parseMarkdown,
	type RawMessage,
	type ThreadInfo,
	type WebhookOptions,
} from "chat";
import { toLineWorksButtonTemplateContent } from "./button-template/button-template";
import { isLineWorksChannelMessageMention } from "./channel-mention";
import { LineWorksClient } from "./client";
import {
	inboundAttachmentType,
	isInboundFileContent,
	outboundAttachmentContentType,
} from "./attachment-content";
import {
	LINEWORKS_MAX_TEXT_LENGTH,
	LineWorksFormatConverter,
} from "./format-converter";
import { decodePostbackData } from "./postback/postback-data";
import {
	createPostbackAuthor,
	createPostbackMessageId,
	getMessagePostbackData,
	isMessagePostbackEvent,
} from "./postback/postback-event";
import { decodeThreadId, encodeThreadId, threadIdFromEventSource } from "./thread-id";
import type {
	LineWorksAdapterConfig,
	LineWorksEventSource,
	LineWorksMessageEvent,
	LineWorksPostbackEvent,
	LineWorksSendMessageResponse,
	LineWorksThreadId,
} from "./types";
import {
	UnauthorizedLineWorksWebhookError,
	verifyLineWorksWebhook,
} from "./webhook";

export class LineWorksAdapter implements Adapter<LineWorksThreadId, unknown> {
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
			accessTokenProvider: config.accessTokenProvider,
			botId: config.botId,
			fetch: config.fetch,
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
		options?: WebhookOptions,
	): Promise<Response> {
		let verified: Awaited<ReturnType<typeof verifyLineWorksWebhook>>;

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

		if (verified.payload.type === "postback") {
			const event = verified.payload as LineWorksPostbackEvent;
			this.processPostback(event, options);
			return new Response("OK", { status: 200 });
		}

		if (verified.payload.type !== "message") {
			this.logger.debug("Ignoring unsupported LINE WORKS callback event", {
				type: verified.payload.type,
			});
			return new Response("OK", { status: 200 });
		}

		const event = verified.payload as LineWorksMessageEvent;
		if (!isProcessableMessageEvent(event)) {
			this.logger.warn("Ignoring unsupported LINE WORKS message type", {
				type: event.content.type,
			});
			return new Response("OK", { status: 200 });
		}

		if (isMessagePostbackEvent(event)) {
			this.processPostbackFromData(
				{
					data: getMessagePostbackData(event),
					issuedTime: event.issuedTime,
					raw: event,
					source: event.source,
				},
				options,
			);
			return new Response("OK", { status: 200 });
		}

		const message = this.parseMessage(event);
		this.requireChat().processMessage(this, message.threadId, message, options);

		return new Response("OK", { status: 200 });
	}

	parseMessage(raw: unknown): Message<unknown> {
		if (!isLineWorksMessageEvent(raw)) {
			throw new ValidationError(
				"lineworks",
				"Expected LINE WORKS message event",
			);
		}

		const event = raw;
		const text = getEventText(event);
		const threadId = this.encodeThreadId(threadIdFromEventSource(event.source));

		const isChannelMessage = Boolean(event.source.channelId);
		const attachments = this.buildInboundAttachments(event);

		return new Message<unknown>({
			attachments,
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
				? isLineWorksChannelMessageMention({
						botUserName: this.userName,
						text,
						treatChannelMessagesAsMentions:
							this.config.treatChannelMessagesAsMentions,
					})
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
		message: AdapterPostableMessage,
	): Promise<RawMessage<LineWorksSendMessageResponse>> {
		const files = extractFiles(message);
		const buttonTemplate = toLineWorksButtonTemplateContent(message);
		const text = buttonTemplate ? "" : this.converter.renderPostable(message);
		if (!buttonTemplate && text.length > LINEWORKS_MAX_TEXT_LENGTH) {
			throw new ValidationError(
				"lineworks",
				`LINE WORKS text messages must be ${LINEWORKS_MAX_TEXT_LENGTH} characters or fewer`,
			);
		}

		const destination = this.decodeThreadId(threadId);
		let raw: LineWorksSendMessageResponse | undefined;

		if (buttonTemplate) {
			raw =
				destination.kind === "user"
					? await this.client.sendUserContent(
							destination.userId,
							buttonTemplate,
						)
					: await this.client.sendChannelContent(
							destination.channelId,
							buttonTemplate,
						);
		} else if (text.length > 0) {
			raw =
				destination.kind === "user"
					? await this.client.sendUserMessage(destination.userId, text)
					: await this.client.sendChannelMessage(destination.channelId, text);
		}

		for (const file of files) {
			const upload = await this.client.createAttachment({
				fileName: file.filename,
			});
			const uploaded = await this.client.uploadAttachment({
				data: file.data,
				fileName: file.filename,
				mimeType: file.mimeType,
				uploadUrl: upload.uploadUrl,
			});
			const content = {
				fileId: uploaded.fileId ?? upload.fileId,
				type: outboundAttachmentContentType({ mimeType: file.mimeType }),
			} as const;
			raw =
				destination.kind === "user"
					? await this.client.sendUserContent(destination.userId, content)
					: await this.client.sendChannelContent(
							destination.channelId,
							content,
						);
		}

		if (!raw) {
			throw new ValidationError(
				"lineworks",
				"LINE WORKS message text or files are required",
			);
		}

		return {
			id: createSentMessageId(),
			raw,
			threadId,
		};
	}

	async fetchMessages(
		_threadId: string,
		_options?: FetchOptions,
	): Promise<FetchResult<unknown>> {
		throw new NotImplementedError(
			"LINE WORKS message history is not supported",
			"fetchMessages",
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
		// LINE WORKS Bot API has no reaction primitive. Treat reaction hooks as no-op.
	}

	async removeReaction(
		_threadId: string,
		_messageId: string,
		_emoji: EmojiValue | string,
	): Promise<void> {
		// LINE WORKS Bot API has no reaction primitive. Treat reaction hooks as no-op.
	}

	async editMessage(): Promise<RawMessage<unknown>> {
		throw new NotImplementedError(
			"LINE WORKS message editing is not supported",
			"editMessage",
		);
	}

	async deleteMessage(): Promise<void> {
		throw new NotImplementedError(
			"LINE WORKS message deletion is not supported",
			"deleteMessage",
		);
	}

	async startTyping(): Promise<void> {
		// LINE WORKS Bot API has no typing indicator primitive.
	}

	private requireChat(): ChatInstance {
		if (!this.chat) {
			throw new ValidationError(
				"lineworks",
				"LineWorksAdapter is not initialized",
			);
		}

		return this.chat;
	}

	private buildInboundAttachments(event: LineWorksMessageEvent): Attachment[] {
		const content = event.content;
		if (!isInboundFileContent(content)) {
			return [];
		}

		const fileId = content.fileId;

		return [
			{
				fetchData: () => this.client.downloadAttachmentData(fileId),
				name: `lineworks-${fileId}`,
				type: inboundAttachmentType(content.type),
			},
		];
	}

	private processPostback(
		event: LineWorksPostbackEvent,
		options?: WebhookOptions,
	): void {
		this.processPostbackFromData(
			{
				data: event.data,
				issuedTime: event.issuedTime,
				raw: event,
				source: event.source,
			},
			options,
		);
	}

	private processPostbackFromData(
		args: {
			data: string;
			issuedTime: number | string;
			raw: LineWorksMessageEvent | LineWorksPostbackEvent;
			source: LineWorksEventSource;
		},
		options?: WebhookOptions,
	): void {
		const threadId = this.encodeThreadId(threadIdFromEventSource(args.source));
		const decoded = decodePostbackData(args.data);

		this.requireChat().processAction(
			{
				actionId: decoded.actionId,
				adapter: this,
				messageId: createPostbackMessageId({
					data: args.data,
					issuedTime: args.issuedTime,
					source: args.source,
					type: args.raw.type,
				}),
				raw: args.raw,
				threadId,
				user: createPostbackAuthor(args.source),
				...(decoded.value !== undefined ? { value: decoded.value } : {}),
			},
			options,
		);
	}
}

function validateConfig(config: LineWorksAdapterConfig): void {
	if (!config.botId) {
		throw new ValidationError("lineworks", "botId is required");
	}

	if (!config.botSecret) {
		throw new ValidationError("lineworks", "botSecret is required");
	}

	if (!config.accessToken && !config.accessTokenProvider) {
		throw new ValidationError(
			"lineworks",
			"accessToken or accessTokenProvider is required",
		);
	}
}

function parseIssuedTime(issuedTime: number | string): Date {
	const date =
		typeof issuedTime === "number"
			? new Date(issuedTime)
			: new Date(issuedTime);

	return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isProcessableMessageEvent(event: LineWorksMessageEvent): boolean {
	if (event.content.type === "text") {
		return true;
	}

	return isInboundFileContent(event.content);
}

function getEventText(event: LineWorksMessageEvent): string {
	return event.content.type === "text" && typeof event.content.text === "string"
		? event.content.text
		: "";
}

function isLineWorksMessageEvent(
	value: unknown,
): value is LineWorksMessageEvent {
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
	return `lineworks:sent:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
