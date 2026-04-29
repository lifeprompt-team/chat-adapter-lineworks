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
    return markdownToPlainText(super.renderPostable(message)).trim();
  }
}
