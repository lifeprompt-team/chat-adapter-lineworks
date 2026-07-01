import { describe, expect, it } from "vitest";
import { ValidationError } from "@chat-adapter/shared";
import { Actions, Button, Card, CardText, LinkButton } from "chat";
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
});
