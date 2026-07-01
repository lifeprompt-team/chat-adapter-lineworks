import { describe, expect, it } from "vitest";

import {
	formatLineWorksPlainTextFromMarkdown,
	LineWorksFormatConverter,
} from "./format-converter";

describe("formatLineWorksPlainTextFromMarkdown", () => {
	it("太字とインラインコードの記法を除去する", () => {
		expect(
			formatLineWorksPlainTextFromMarkdown({
				text: "**bold** and `code`",
			}),
		).toBe("bold and code");
	});

	it("見出し・段落・リスト・引用・コード・リンク・テーブルの区切りを保つ", () => {
		const markdown = [
			"様々なMarkdown記法を試してみますね!",
			"",
			"# 見出しH1",
			"",
			"## 見出しH2",
			"",
			"**太字** and *斜体*",
			"",
			"- 項目1",
			"- 項目2",
			"",
			"1. 番号1",
			"2. 番号2",
			"",
			"> 引用文",
			"",
			"```js",
			"const x = 1;",
			"console.log(x);",
			"```",
			"",
			"[リンク](https://example.com)",
			"",
			"| A | B |",
			"|---|---|",
			"| 1 | 2 |",
		].join("\n");

		const result = formatLineWorksPlainTextFromMarkdown({ text: markdown });

		expect(result).toContain("様々なMarkdown記法を試してみますね!");
		expect(result).toContain("見出しH1");
		expect(result).toContain("見出しH2");
		expect(result).toContain("太字 and 斜体");
		expect(result).toContain("- 項目1");
		expect(result).toContain("- 項目2");
		expect(result).toContain("1. 番号1");
		expect(result).toContain("2. 番号2");
		expect(result).toContain("> 引用文");
		expect(result).toContain("const x = 1;");
		expect(result).toContain("console.log(x);");
		expect(result).toContain("リンク\nhttps://example.com");
		expect(result).toContain("A / B");
		expect(result).toContain("1 / 2");

		expect(result).not.toMatch(/見出しH1見出しH2/);
		expect(result).not.toMatch(/項目1項目2/);
		expect(result).not.toMatch(/番号1番号2/);
		expect(result).not.toMatch(/引用文const x/);
		expect(result).not.toMatch(/console\.log\(x\);リンク/);
		expect(result).not.toMatch(/リンクAB/);
		expect(result).not.toMatch(/12$/);
		expect(result).not.toContain("|---|");
		expect(result).not.toMatch(/リンク \(https:\/\/example\.com\)/);
	});

	it("段落間の空行を保つ", () => {
		const result = formatLineWorksPlainTextFromMarkdown({
			text: "1行目\n\n2行目",
		});

		expect(result).toBe("1行目\n\n2行目");
	});

	it("CRLF を含む入力でも改行を保つ", () => {
		const result = formatLineWorksPlainTextFromMarkdown({
			text: "1行目\r\n\r\n2行目\r\n- item",
		});

		expect(result).toBe("1行目\r\n\r\n2行目\r\n- item");
	});

	it("リンク URL のみの場合は URL だけを残す", () => {
		expect(
			formatLineWorksPlainTextFromMarkdown({
				text: "<https://example.com>",
			}),
		).toBe("https://example.com");
	});

	it("デモ Markdown 全体で隣接連結しない", () => {
		const markdown = [
			"様々なMarkdown記法を試してみますね!",
			"",
			"# 見出しH1",
			"## 見出しH2",
			"",
			"太字 **bold** と *italic* 斜体",
			"",
			"インラインコード `code` も使えます",
			"",
			"リンクも使えます",
			"[Example](https://example.com)",
			"",
			"リスト",
			"",
			"番号付き:",
			"1. 1番目",
			"2. 2番目",
			"3. 3番目",
			"",
			"ネスト:",
			"- 親項目",
			"  - 子項目",
			"  - 子項目",
			"",
			"コードブロック",
			"",
			"```python",
			"def greet(name):",
			'    return f"Hello, {name}!"',
			"",
			'print(greet("Sunaba"))',
			"```",
			"",
			"引用",
			"",
			"> これは引用文です。",
			"> 複数行もいけます。",
			"",
			"テーブル",
			"",
			"| 機能 | 対応 | 備考 |",
			"|------|------|------|",
			"| 太字 | ✅ | text |",
			"| リスト | ✅ | - item |",
			"",
			"水平線",
			"",
			"---",
			"",
			"絵文字 🚀✅❌",
		].join("\n");

		const result = formatLineWorksPlainTextFromMarkdown({ text: markdown });

		expect(result).toContain("見出しH1\n見出しH2");
		expect(result).toContain("Example\nhttps://example.com");
		expect(result).toContain("1. 1番目\n2. 2番目");
		expect(result).toContain("def greet(name):");
		expect(result).toContain("> これは引用文です。");
		expect(result).toContain("機能 / 対応 / 備考");
		expect(result).toContain("太字 / ✅ / text");

		expect(result).not.toMatch(/使えますExample/);
		expect(result).not.toMatch(/Sunaba"\)引用/);
		expect(result).not.toMatch(/------\|------\|------/);
		expect(result).not.toMatch(/Example \(https:\/\/example\.com\)/);
	});
});

describe("LineWorksFormatConverter", () => {
	const converter = new LineWorksFormatConverter();

	it("preserves newlines in plain string messages", () => {
		const text = [
			"見出し",
			"",
			"- item A",
			"- item B",
			"",
			"https://example.com",
		].join("\n");

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
		expect(converter.renderPostable({ markdown: "**bold** text" })).toBe(
			"bold text",
		);
	});

	it("preserves paragraph breaks when converting markdown objects", () => {
		expect(converter.renderPostable({ markdown: "line1\n\nline2" })).toBe(
			"line1\n\nline2",
		);
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

	it("converts AST to LINE WORKS plain text", () => {
		const ast = converter.toAst("**bold** text");

		expect(converter.fromAst(ast)).toBe("bold text");
	});

	it("converts AST through renderFormatted-compatible plain text", () => {
		const ast = converter.toAst("line1\n\n[line2](https://example.com)");

		expect(converter.fromAst(ast)).toBe("line1\n\nline2\nhttps://example.com");
	});
});
