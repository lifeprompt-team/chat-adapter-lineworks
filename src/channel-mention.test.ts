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

  it("botUserId が未設定なら channel text は mention 扱いにしない", () => {
    expect(
      isLineWorksChannelMessageMention({
        text: 'hello <m userId="bot-user">',
      }),
    ).toBe(false);
  });

  it("channel text に bot の mention tag があれば mention 扱いにする", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserId: "bot-user",
        text: 'hello <m userId="bot-user"> please help',
      }),
    ).toBe(true);
  });

  it("他ユーザーの mention tag だけでは mention 扱いにしない", () => {
    expect(
      isLineWorksChannelMessageMention({
        botUserId: "bot-user",
        text: 'hello <m userId="other-user">',
      }),
    ).toBe(false);
  });
});
