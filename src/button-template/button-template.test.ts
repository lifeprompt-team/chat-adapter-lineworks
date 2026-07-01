import { describe, expect, it } from "vitest";
import { ValidationError } from "@chat-adapter/shared";
import {
	Actions,
	Button,
	Card,
	CardLink,
	CardText,
	Field,
	Fields,
	Image,
	LinkButton,
} from "chat";
import { toLineWorksButtonTemplateContent } from "./button-template";

describe("toLineWorksButtonTemplateContent", () => {
	it("returns null for non-card messages", () => {
		expect(toLineWorksButtonTemplateContent("hello")).toBeNull();
	});

	it("builds button template content from Chat SDK cards", () => {
		expect(
			toLineWorksButtonTemplateContent(
				Card({
					title: "Pending",
					children: [
						CardText("Approve this?"),
						Actions([
							Button({ id: "approve", label: "Approve", value: "pending-1" }),
							LinkButton({
								label: "Details",
								url: "https://example.com/cases/case-1",
							}),
						]),
					],
				}),
			),
		).toEqual({
			actions: [
				{
					label: "Approve",
					postback: "approve\npending-1",
					type: "message",
				},
				{
					label: "Details",
					type: "uri",
					uri: "https://example.com/cases/case-1",
				},
			],
			contentText: "Pending\nApprove this?",
			type: "button_template",
		});
	});

	it("excludes disabled buttons", () => {
		expect(
			toLineWorksButtonTemplateContent(
				Card({
					title: "Actions",
					children: [
						Actions([
							Button({ id: "enabled", label: "OK" }),
							Button({ disabled: true, id: "disabled", label: "No" }),
						]),
					],
				}),
			),
		).toEqual({
			actions: [
				{
					label: "OK",
					postback: "enabled",
					type: "message",
				},
			],
			contentText: "Actions",
			type: "button_template",
		});
	});

	it("rejects labels over 20 characters", () => {
		expect(() =>
			toLineWorksButtonTemplateContent(
				Card({
					title: "Long label",
					children: [
						Actions([
							Button({
								id: "approve",
								label: "a".repeat(21),
							}),
						]),
					],
				}),
			),
		).toThrow(ValidationError);
	});

	it("rejects action ids containing newlines", () => {
		expect(() =>
			toLineWorksButtonTemplateContent(
				Card({
					title: "Invalid action id",
					children: [
						Actions([
							Button({
								id: "approve\nbad",
								label: "Approve",
							}),
						]),
					],
				}),
			),
		).toThrow(ValidationError);
	});

	it("collects subtitle, fields, links, and image alt into contentText", () => {
		expect(
			toLineWorksButtonTemplateContent(
				Card({
					title: "Title",
					subtitle: "Subtitle",
					children: [
						CardText("Body"),
						Fields([Field({ label: "Status", value: "Open" })]),
						CardLink({ label: "Docs", url: "https://example.com/docs" }),
						Image({
							alt: "Screenshot",
							url: "https://example.com/image.png",
						}),
						Actions([Button({ id: "ok", label: "OK" })]),
					],
				}),
			),
		).toMatchObject({
			contentText: [
				"Title",
				"Subtitle",
				"Body",
				"Status: Open",
				"Docs: https://example.com/docs",
				"Screenshot",
			].join("\n"),
			type: "button_template",
		});
	});
});
