import { ValidationError } from "@chat-adapter/shared";

/** message action の postback フィールド上限（LINE WORKS Bot API） */
export const MAX_MESSAGE_ACTION_POSTBACK_LENGTH = 1000;
const ACTION_DATA_DELIMITER = "\n";

export function decodePostbackData(data: string): {
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

export function encodePostbackData(args: {
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
	if (encoded.length > MAX_MESSAGE_ACTION_POSTBACK_LENGTH) {
		throw new ValidationError(
			"lineworks",
			`LINE WORKS message action postback must be ${MAX_MESSAGE_ACTION_POSTBACK_LENGTH} characters or fewer`,
		);
	}
	return encoded;
}
