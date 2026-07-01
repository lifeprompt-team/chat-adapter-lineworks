import { describe, expect, it } from "vitest";
import {
	inboundAttachmentType,
	isInboundFileContent,
	outboundAttachmentContentType,
} from "./attachment-content";

describe("isInboundFileContent", () => {
	it("accepts file-like content with fileId", () => {
		expect(
			isInboundFileContent({
				fileId: "file-1",
				type: "image",
			}),
		).toBe(true);
	});

	it("rejects file-like content without fileId", () => {
		expect(
			isInboundFileContent({
				type: "image",
			}),
		).toBe(false);
	});

	it("rejects non-file content", () => {
		expect(
			isInboundFileContent({
				text: "hello",
				type: "text",
			}),
		).toBe(false);
	});
});

describe("inboundAttachmentType", () => {
	it("keeps image attachments as image", () => {
		expect(inboundAttachmentType("image")).toBe("image");
	});

	it("keeps other file-like attachments as their content type", () => {
		expect(inboundAttachmentType("file")).toBe("file");
		expect(inboundAttachmentType("audio")).toBe("audio");
		expect(inboundAttachmentType("video")).toBe("video");
	});
});

describe("outboundAttachmentContentType", () => {
	it("maps image mime types to image content", () => {
		expect(
			outboundAttachmentContentType({
				mimeType: "image/png",
			}),
		).toBe("image");
	});

	it("maps non-image mime types to file content", () => {
		expect(
			outboundAttachmentContentType({
				mimeType: "application/pdf",
			}),
		).toBe("file");
		expect(outboundAttachmentContentType({})).toBe("file");
	});
});
