import { describe, expect, it } from "vitest";
import { ValidationError } from "@chat-adapter/shared";
import {
	decodePostbackData,
	encodePostbackData,
	MAX_MESSAGE_ACTION_POSTBACK_LENGTH,
} from "./postback-data";
import { isMessagePostbackEvent } from "./postback-event";
import type { LineWorksMessageEvent } from "../types";

describe("encodePostbackData / decodePostbackData", () => {
	it("encodes action id only when value is absent", () => {
		expect(encodePostbackData({ actionId: "approve" })).toBe("approve");
		expect(decodePostbackData("approve")).toEqual({ actionId: "approve" });
	});

	it("encodes action id and value with newline delimiter", () => {
		expect(
			encodePostbackData({ actionId: "approve", value: "pending-1" }),
		).toBe("approve\npending-1");
		expect(decodePostbackData("approve\npending-1")).toEqual({
			actionId: "approve",
			value: "pending-1",
		});
	});

	it("rejects action ids containing newlines", () => {
		expect(() =>
			encodePostbackData({ actionId: "approve\nbad" }),
		).toThrow(ValidationError);
	});

	it("rejects postback payloads over the API limit", () => {
		expect(() =>
			encodePostbackData({
				actionId: "approve",
				value: "a".repeat(MAX_MESSAGE_ACTION_POSTBACK_LENGTH),
			}),
		).toThrow(ValidationError);
	});

	it("accepts postback payloads at the API limit", () => {
		const actionId = "a".repeat(MAX_MESSAGE_ACTION_POSTBACK_LENGTH);

		expect(encodePostbackData({ actionId })).toHaveLength(
			MAX_MESSAGE_ACTION_POSTBACK_LENGTH,
		);
	});

	it("rejects postback payloads one character over the API limit", () => {
		expect(() =>
			encodePostbackData({ actionId: "a".repeat(MAX_MESSAGE_ACTION_POSTBACK_LENGTH + 1) }),
		).toThrow(ValidationError);
	});
});

describe("isMessagePostbackEvent", () => {
	it("detects text messages with postback", () => {
		const event: LineWorksMessageEvent = {
			content: {
				postback: "approve\npending-1",
				text: "Approve",
				type: "text",
			},
			issuedTime: "2026-04-29T00:00:00Z",
			source: { userId: "user-1" },
			type: "message",
		};

		expect(isMessagePostbackEvent(event)).toBe(true);
	});

	it("returns false for plain text messages", () => {
		const event: LineWorksMessageEvent = {
			content: { text: "hello", type: "text" },
			issuedTime: "2026-04-29T00:00:00Z",
			source: { userId: "user-1" },
			type: "message",
		};

		expect(isMessagePostbackEvent(event)).toBe(false);
	});
});
