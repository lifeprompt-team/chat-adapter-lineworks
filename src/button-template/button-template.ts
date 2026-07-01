import { ValidationError } from "@chat-adapter/shared";
import type {
	AdapterPostableMessage,
	ButtonElement,
	CardChild,
	CardElement,
	LinkButtonElement,
} from "chat";
import { encodePostbackData } from "../postback/postback-data";
import type {
	LineWorksOutboundContent,
	LineWorksTemplateAction,
} from "../types";

export const MAX_BUTTON_TEMPLATE_TEXT_LENGTH = 1000;
export const MAX_BUTTON_TEMPLATE_ACTIONS = 10;
export const MAX_BUTTON_TEMPLATE_LABEL_LENGTH = 20;

export function toLineWorksButtonTemplateContent(
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

	const contentText = collectCardText(card);
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

function collectCardText(card: CardElement): string {
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
