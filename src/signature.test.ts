import { describe, expect, it } from "vitest";
import {
  createLineWorksSignature,
  verifyLineWorksSignature,
} from "./signature";

describe("LINE WORKS callback signatures", () => {
  it("verifies a valid signature", () => {
    const rawBody = '{"type":"message","content":{"type":"text","text":"hi"}}';
    const secret = "bot-secret";
    const signature = createLineWorksSignature(rawBody, secret);

    expect(verifyLineWorksSignature(rawBody, secret, signature)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const rawBody = '{"type":"message","content":{"type":"text","text":"hi"}}';
    const secret = "bot-secret";
    const signature = createLineWorksSignature(rawBody, secret);

    expect(
      verifyLineWorksSignature(`${rawBody}\n`, secret, signature)
    ).toBe(false);
  });
});
