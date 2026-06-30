import { createHash } from "node:crypto";
import { extractFiles, ValidationError } from "@chat-adapter/shared";
import {
	type Adapter,
	type AdapterPostableMessage,
	type Attachment,
	type Author,
	type ButtonElement,
	type CardChild,
	type CardElement,
	type ChatInstance,
	ConsoleLogger,
	type EmojiValue,
	type FetchOptions,
	type FetchResult,
	type FormattedContent,
	type LinkButtonElement,
	type Logger,
	Message,
	NotImplementedError,
	parseMarkdown,
	type RawMessage,
	type ThreadInfo,
	type WebhookOptions,
} from "chat";
import { isLineWorksChannelMessageMention } from "./channel-mention";
import { LineWorksClient } from "./client";
import {
	LINEWORKS_MAX_TEXT_LENGTH,
	LineWorksFormatConverter,
} from "./format-converter";
import { decodeThreadId, encodeThreadId } from "./thread-id";
import type {
	LineWorksAdapterConfig,
	LineWorksMessageEvent,
	LineWorksOutboundContent,
	LineWorksPostbackEvent,
	LineWorksSendMessageResponse,
	LineWorksTemplateAction,
	LineWorksThreadId,
} from "./types";
import {
	UnauthorizedLineWorksWebhookError,
	verifyLineWorksWebhook,
} from "./webhook";

const MAX_BUTTON_TEMPLATE_TEXT_LENGTH = 1000;
const MAX_BUTTON_TEMPLATE_ACTIONS = 10;
const MAX_BUTTON_TEMPLATE_LABEL_LENGTH = 20;
const MAX_BUTTON_TEMPLATE_POSTBACK_LENGTH = 1000;
const ACTION_DATA_DELIMITER = "\n";

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
						botUserId: this.config.botUserId,
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
		const buttonTemplate = buildLineWorksButtonTemplate(message);
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
				type: file.mimeType?.startsWith("image/") ? "image" : "file",
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
		if (
			!(
				content.type === "image" ||
				content.type === "file" ||
				content.type === "audio" ||
				content.type === "video"
			) ||
			typeof content.fileId !== "string" ||
			content.fileId.length === 0
		) {
			return [];
		}

		const fileId = content.fileId;
		const attachmentType = content.type === "image" ? "image" : content.type;

		return [
			{
				fetchData: () => this.client.downloadAttachmentData(fileId),
				name: `lineworks-${fileId}`,
				type: attachmentType,
			},
		];
	}

	private processPostback(
		event: LineWorksPostbackEvent,
		options?: WebhookOptions,
	): void {
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
		const decoded = decodePostbackData(event.data);

		this.requireChat().processAction(
			{
				actionId: decoded.actionId,
				adapter: this,
				messageId: createPostbackMessageId(event),
				raw: event,
				threadId,
				user: createPostbackAuthor(event),
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
	return (
		(event.content.type === "image" ||
			event.content.type === "file" ||
			event.content.type === "audio" ||
			event.content.type === "video") &&
		typeof event.content.fileId === "string" &&
		event.content.fileId.length > 0
	);
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

function decodePostbackData(data: string): {
	actionId: string;
	value?: string;
} {
	const delimiterIndex = data.indexOf(ACTION_DATA_DELIMITER);
	if (delimiterIndex === -1) {
		return { actionId: data };
	}
	return {
		actionId: data.slice(0, delimiterIndex),
		value: data.slice(delimiterIndex + ACTION_DATA_DELIMITER.length),
	};
}

function encodePostbackData(args: {
	actionId: string;
	value?: string;
}): string {
	if (args.actionId.includes(ACTION_DATA_DELIMITER)) {
		throw new ValidationError(
			"lineworks",
			"LINE WORKS action id must not include a newline",
		);
	}
	const encoded =
		args.value === undefined || args.value.length === 0
			? args.actionId
			: `${args.actionId}${ACTION_DATA_DELIMITER}${args.value}`;
	if (encoded.length > MAX_BUTTON_TEMPLATE_POSTBACK_LENGTH) {
		throw new ValidationError(
			"lineworks",
			`LINE WORKS postback data must be ${MAX_BUTTON_TEMPLATE_POSTBACK_LENGTH} characters or fewer`,
		);
	}
	return encoded;
}

function buildLineWorksButtonTemplate(
	message: AdapterPostableMessage,
): LineWorksOutboundContent | null {
	const card = extractCardElement(message);
	if (!card) {
		return null;
	}

	const actions = extractTemplateActions(card);
	if (actions.length === 0) {
		return null;
	}
	if (actions.length > MAX_BUTTON_TEMPLATE_ACTIONS) {
		throw new ValidationError(
			"lineworks",
			`LINE WORKS button templates support up to ${MAX_BUTTON_TEMPLATE_ACTIONS} actions`,
		);
	}

	const contentText = buildCardContentText(card);
	if (contentText.length === 0) {
		throw new ValidationError(
			"lineworks",
			"LINE WORKS button template content text is required",
		);
	}
	if (contentText.length > MAX_BUTTON_TEMPLATE_TEXT_LENGTH) {
		throw new ValidationError(
			"lineworks",
			`LINE WORKS button template content text must be ${MAX_BUTTON_TEMPLATE_TEXT_LENGTH} characters or fewer`,
		);
	}

	return {
		actions,
		contentText,
		type: "button_template",
	};
}

function extractCardElement(
	message: AdapterPostableMessage,
): CardElement | null {
	if (isCardElementShape(message)) {
		return message;
	}
	if (
		typeof message === "object" &&
		message !== null &&
		"card" in message &&
		isCardElementShape(message.card)
	) {
		return message.card;
	}
	return null;
}

function isCardElementShape(value: unknown): value is CardElement {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "card" &&
		"children" in value &&
		Array.isArray(value.children)
	);
}

function extractTemplateActions(card: CardElement): LineWorksTemplateAction[] {
	const actions: LineWorksTemplateAction[] = [];
	for (const child of card.children) {
		collectActionsFromChild(child, actions);
	}
	return actions;
}

function collectActionsFromChild(
	child: CardChild,
	actions: LineWorksTemplateAction[],
): void {
	if (child.type === "actions") {
		for (const action of child.children) {
			if (action.type === "button") {
				const templateAction = toLineWorksMessageAction(action);
				if (templateAction) {
					actions.push(templateAction);
				}
				continue;
			}
			if (action.type === "link-button") {
				actions.push(toLineWorksUriAction(action));
				continue;
			}
			throw new ValidationError(
				"lineworks",
				`LINE WORKS button templates do not support ${action.type} actions`,
			);
		}
		return;
	}
	if (child.type === "section") {
		for (const sectionChild of child.children) {
			collectActionsFromChild(sectionChild, actions);
		}
	}
}

function toLineWorksMessageAction(
	action: ButtonElement,
): LineWorksTemplateAction | null {
	if (action.disabled) {
		return null;
	}
	validateButtonLabel(action.label);
	return {
		label: action.label,
		postback: encodePostbackData({
			actionId: action.id,
			value: action.value,
		}),
		type: "message",
	};
}

function toLineWorksUriAction(
	action: LinkButtonElement,
): LineWorksTemplateAction {
	validateButtonLabel(action.label);
	return {
		label: action.label,
		type: "uri",
		uri: action.url,
	};
}

function validateButtonLabel(label: string): void {
	if (label.length === 0) {
		throw new ValidationError(
			"lineworks",
			"LINE WORKS button label is required",
		);
	}
	if (label.length > MAX_BUTTON_TEMPLATE_LABEL_LENGTH) {
		throw new ValidationError(
			"lineworks",
			`LINE WORKS button labels must be ${MAX_BUTTON_TEMPLATE_LABEL_LENGTH} characters or fewer`,
		);
	}
}

function buildCardContentText(card: CardElement): string {
	const parts = [
		card.title,
		card.subtitle,
		...card.children.flatMap((child) => collectCardChildText(child)),
	];
	return parts
		.map((part) => part?.trim())
		.filter((part): part is string => Boolean(part && part.length > 0))
		.join("\n");
}

function collectCardChildText(child: CardChild): string[] {
	switch (child.type) {
		case "text":
			return [child.content];
		case "section":
			return child.children.flatMap((sectionChild) =>
				collectCardChildText(sectionChild),
			);
		case "fields":
			return child.children.map((field) => `${field.label}: ${field.value}`);
		case "link":
			return [`${child.label}: ${child.url}`];
		case "image":
			return child.alt ? [child.alt] : [];
		case "actions":
		case "divider":
		case "table":
			return [];
		default: {
			const _never: never = child;
			return _never;
		}
	}
}

function createPostbackAuthor(event: LineWorksPostbackEvent): Author {
	return {
		fullName: event.source.userId,
		isBot: "unknown",
		isMe: false,
		userId: event.source.userId,
		userName: event.source.userId,
	};
}

function createPostbackMessageId(event: LineWorksPostbackEvent): string {
	const hashInput = JSON.stringify({
		channelId: event.source.channelId ?? null,
		data: event.data,
		issuedTime: event.issuedTime,
		type: event.type,
		userId: event.source.userId,
	});
	const hash = createHash("sha256").update(hashInput).digest("base64url");

	return `lineworks:postback:${hash}`;
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
