import {
	type AdapterPostableMessage,
	BaseFormatConverter,
	parseMarkdown,
	type Root,
	stringifyMarkdown,
} from "chat";

export const LINEWORKS_MAX_TEXT_LENGTH = 2000;

const CODE_FENCE_PATTERN = /^(\s*)(```+|~~~+)/;

function formatMarkdownLink(args: { label: string; url: string }): string {
	const label = args.label.trim();
	const url = args.url.trim();
	if (label.length === 0 || label === url) {
		return url;
	}
	return `${label}\n${url}`;
}

function stripInlineDecorations(line: string): string {
	let result = line;

	result = result.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		(_match, alt: string, url: string) =>
			formatMarkdownLink({ label: alt, url }),
	);

	result = result.replace(
		/\[([^\]]*)\]\(([^)]+)\)/g,
		(_match, label: string, url: string) => formatMarkdownLink({ label, url }),
	);

	result = result.replace(/<([^>\s]+)>/g, (_match, url: string) => url);

	result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
	result = result.replace(/__([^_]+)__/g, "$1");
	result = result.replace(/~~([^~]+)~~/g, "$1");
	result = result.replace(/\*([^*\n]+)\*/g, "$1");
	result = result.replace(/_([^_\n]+)_/g, "$1");
	result = result.replace(/`([^`]+)`/g, "$1");

	return result;
}

function isTableSeparatorLine(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.includes("|")) {
		return false;
	}
	return /^\|?[\s\-:|]+(\|[\s\-:|]+)+\|?$/.test(trimmed);
}

function isTableRow(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function formatTableRow(line: string): string {
	const cells = line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());

	return cells.join(" / ");
}

function stripHeadingPrefix(line: string): string {
	const match = line.match(/^(#{1,6})\s+(.*)$/);
	if (match?.[2] !== undefined) {
		return match[2];
	}
	return line;
}

function processMarkdownLine(line: string): string | null {
	if (isTableSeparatorLine(line)) {
		return null;
	}

	let processed = line;
	if (isTableRow(line)) {
		processed = formatTableRow(line);
	}

	processed = stripHeadingPrefix(processed);
	processed = stripInlineDecorations(processed);

	return processed;
}

export function formatLineWorksPlainTextFromMarkdown(args: {
	text: string;
}): string {
	const lines = args.text.split("\n");
	const output: string[] = [];
	let inCodeBlock = false;

	for (const line of lines) {
		const fenceMatch = line.match(CODE_FENCE_PATTERN);
		if (fenceMatch) {
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			output.push(line);
			continue;
		}

		const processed = processMarkdownLine(line);
		if (processed === null) {
			continue;
		}
		output.push(processed);
	}

	return output.join("\n").trim();
}

export class LineWorksFormatConverter extends BaseFormatConverter {
	toAst(platformText: string): Root {
		return parseMarkdown(platformText);
	}

	fromAst(ast: Root): string {
		return stringifyMarkdown(ast).trim();
	}

	renderPostable(message: AdapterPostableMessage): string {
		if (typeof message === "string") {
			return message.trim();
		}
		if (typeof message === "object" && message !== null && "raw" in message) {
			return message.raw.trim();
		}
		return formatLineWorksPlainTextFromMarkdown({
			text: super.renderPostable(message),
		});
	}
}
