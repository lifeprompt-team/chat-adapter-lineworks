import type { LineWorksMessageContent } from "./types";

const INBOUND_FILE_CONTENT_TYPES = [
	"image",
	"file",
	"audio",
	"video",
] as const;

type InboundFileContentType = (typeof INBOUND_FILE_CONTENT_TYPES)[number];

type InboundFileContent = Extract<
	LineWorksMessageContent,
	{ type: InboundFileContentType }
> & {
	fileId: string;
};

export function isInboundFileContent(
	content: LineWorksMessageContent,
): content is InboundFileContent {
	if (
		!(
			content.type === "image" ||
			content.type === "file" ||
			content.type === "audio" ||
			content.type === "video"
		)
	) {
		return false;
	}

	return typeof content.fileId === "string" && content.fileId.length > 0;
}

export function inboundAttachmentType(
	contentType: InboundFileContentType,
): InboundFileContentType {
	return contentType === "image" ? "image" : contentType;
}

export function outboundAttachmentContentType(args: {
	mimeType?: string;
}): "image" | "file" {
	return args.mimeType?.startsWith("image/") ? "image" : "file";
}
