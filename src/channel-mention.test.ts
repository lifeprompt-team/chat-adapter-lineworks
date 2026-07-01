import { describe, expect, it } from "vitest";

import { isLineWorksChannelMessageMention } from "./channel-mention";

describe("isLineWorksChannelMessageMention", () => {
  it("treatChannelMessagesAsMentions が true なら channel text を mention 扱いにする", () => {
    expect(
      isLineWorksChannelMessageMention({
        text: "hello",
        treatChannelMessagesAsMentions: true,
      }),
    ).toBe(true);
  });

  it("botUserName が未設定なら channel text は mention 扱いにしない", () => {
    expect(
      isLineWorksChannelMessageMention({
        text: "@AxMates Bot hello",
      }),
    ).toBe(false);
  });

  it("実 payload 相当: @表示名 mention 付き channel text を mention 扱いにする", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserName: "AxMates Bot",
        text: "@AxMates Bot テスト",
      }),
    ).toBe(true);
  });

  it("実 payload 相当: mention なし channel text は mention 扱いにしない", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserName: "AxMates Bot",
        text: "テスト",
      }),
    ).toBe(false);
  });

  it("表示名にスペースがあっても @mention を検出する", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserName: "AxMates Bot",
        text: "@AxMates Bot \nやっほー",
      }),
    ).toBe(true);
  });

  it("@表示名 の直後が文末なら mention 扱いにする", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserName: "AxMates Bot",
        text: "@AxMates Bot",
      }),
    ).toBe(true);
  });

  it("@表示名 prefix だけでは mention 扱いにしない", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserName: "AxMates Bot",
        text: "@AxMates Botany hello",
      }),
    ).toBe(false);
  });
});
