import { createHash } from "node:crypto";
import { ValidationError } from "@chat-adapter/shared";
import type { Author } from "chat";
import type {
	LineWorksEventSource,
	LineWorksMessageEvent,
} from "../types";

export function isMessagePostbackEvent(event: LineWorksMessageEvent): boolean {
	return (
		event.content.type === "text" &&
		typeof event.content.postback === "string" &&
		event.content.postback.length > 0
	);
}

export function getMessagePostbackData(event: LineWorksMessageEvent): string {
	if (!isMessagePostbackEvent(event)) {
		throw new ValidationError(
			"lineworks",
			"Expected LINE WORKS message event with postback",
		);
	}

	const content = event.content;
	if (content.type !== "text" || typeof content.postback !== "string") {
		throw new ValidationError(
			"lineworks",
			"Expected LINE WORKS message event with postback",
		);
	}

	return content.postback;
}

export function createPostbackAuthor(source: LineWorksEventSource): Author {
	return {
		fullName: source.userId,
		isBot: "unknown",
		isMe: false,
		userId: source.userId,
		userName: source.userId,
	};
}

export function createPostbackMessageId(args: {
	data: string;
	issuedTime: number | string;
	source: LineWorksEventSource;
	type: string;
}): string {
	const hashInput = JSON.stringify({
		channelId: args.source.channelId ?? null,
		data: args.data,
		issuedTime: args.issuedTime,
		type: args.type,
		userId: args.source.userId,
	});
	const hash = createHash("sha256").update(hashInput).digest("base64url");

	return `lineworks:postback:${hash}`;
}
