import { describe, expect, it } from "vitest";
import {
	decodeThreadId,
	encodeThreadId,
	threadIdFromEventSource,
} from "./thread-id";

describe("thread IDs", () => {
	it("roundtrips a user thread", () => {
		const encoded = encodeThreadId({ kind: "user", userId: "user:123/abc" });

		expect(encoded).toBe("lineworks:user:dXNlcjoxMjMvYWJj");
		expect(decodeThreadId(encoded)).toEqual({
			kind: "user",
			userId: "user:123/abc",
		});
	});

	it("roundtrips a channel thread", () => {
		const encoded = encodeThreadId({
			channelId: "channel:123/abc",
			kind: "channel",
		});

		expect(encoded).toBe("lineworks:channel:Y2hhbm5lbDoxMjMvYWJj");
		expect(decodeThreadId(encoded)).toEqual({
			channelId: "channel:123/abc",
			kind: "channel",
		});
	});

	it("rejects invalid thread IDs", () => {
		expect(() => decodeThreadId("lineworks:bad:id")).toThrow();
		expect(() => decodeThreadId("slack:user:id")).toThrow();
	});
});

describe("threadIdFromEventSource", () => {
	it("maps user sources to user thread IDs", () => {
		expect(
			threadIdFromEventSource({
				domainId: 1,
				userId: "user-1",
			}),
		).toEqual({
			domainId: 1,
			kind: "user",
			userId: "user-1",
		});
	});

	it("maps channel sources to channel thread IDs", () => {
		expect(
			threadIdFromEventSource({
				channelId: "channel-1",
				domainId: 1,
				userId: "user-1",
			}),
		).toEqual({
			channelId: "channel-1",
			domainId: 1,
			kind: "channel",
		});
	});
});
