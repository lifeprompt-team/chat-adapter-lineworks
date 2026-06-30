import { describe, expect, it } from "vitest";

import { LineWorksFormatConverter } from "./format-converter";

describe("LineWorksFormatConverter", () => {
  const converter = new LineWorksFormatConverter();

  it("preserves newlines in plain string messages", () => {
    const text = ["見出し", "", "- item A", "- item B", "", "https://example.com"].join("\n");

    expect(converter.renderPostable(text)).toBe(text);
  });

  it("preserves newlines in raw messages", () => {
    const text = "1行目\n\n2行目";

    expect(converter.renderPostable({ raw: text })).toBe(text);
  });

  it("trims leading and trailing whitespace without collapsing internal newlines", () => {
    const text = "  1行目\n\n2行目  ";

    expect(converter.renderPostable(text)).toBe("1行目\n\n2行目");
    expect(converter.renderPostable({ raw: text })).toBe("1行目\n\n2行目");
  });

  it("converts markdown messages to plain text", () => {
    expect(converter.renderPostable({ markdown: "**bold** text" })).toBe("bold text");
  });

  it("collapses paragraph breaks when converting markdown objects", () => {
    expect(converter.renderPostable({ markdown: "line1\n\nline2" })).toBe("line1line2");
  });

  it("does not collapse paragraph breaks in preformatted outbound text", () => {
    const formatted = [
      "マークダウンテスト",
      "",
      "見出し",
      "",
      "太字 と 斜体",
      "",
      "1. 1番目",
      "2. 2番目",
      "",
      "function greet(name) {",
      "  return 1;",
      "}",
      "",
      "Google",
      "https://www.google.com",
    ].join("\n");

    expect(converter.renderPostable(formatted)).toBe(formatted);
    expect(converter.renderPostable({ raw: formatted })).toBe(formatted);
  });
});
