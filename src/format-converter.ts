import {
  BaseFormatConverter,
  markdownToPlainText,
  parseMarkdown,
  stringifyMarkdown,
  type AdapterPostableMessage,
  type Root,
} from "chat";

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
    return markdownToPlainText(super.renderPostable(message)).trim();
  }
}
