import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@chat-adapter/shared";
import { createLineWorksAdapter } from "./factory";
import { LineWorksAdapter } from "./adapter";

const SERVICE_ACCOUNT_ENV = {
  LINEWORKS_BOT_ID: "bot-id",
  LINEWORKS_BOT_SECRET: "bot-secret",
  LINEWORKS_CLIENT_ID: "client-id",
  LINEWORKS_CLIENT_SECRET: "client-secret",
  LINEWORKS_SERVICE_ACCOUNT: "service@example.com",
  LINEWORKS_PRIVATE_KEY: "private-key",
  LINEWORKS_SCOPES: "bot.message,bot.read",
} as const;

describe("createLineWorksAdapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates an adapter from explicit config", () => {
    const adapter = createLineWorksAdapter({
      accessToken: "access-token",
      botId: "bot-id",
      botSecret: "bot-secret",
    });

    expect(adapter).toBeInstanceOf(LineWorksAdapter);
  });

  it("creates an adapter from LINEWORKS_ACCESS_TOKEN env", () => {
    vi.stubEnv("LINEWORKS_BOT_ID", "bot-id");
    vi.stubEnv("LINEWORKS_BOT_SECRET", "bot-secret");
    vi.stubEnv("LINEWORKS_ACCESS_TOKEN", "access-token");

    const adapter = createLineWorksAdapter();

    expect(adapter).toBeInstanceOf(LineWorksAdapter);
  });

  it("creates an adapter with a service account token provider from env", () => {
    for (const [key, value] of Object.entries(SERVICE_ACCOUNT_ENV)) {
      vi.stubEnv(key, value);
    }

    const adapter = createLineWorksAdapter();

    expect(adapter).toBeInstanceOf(LineWorksAdapter);
  });

  it("throws when service account env is partially set", () => {
    vi.stubEnv("LINEWORKS_BOT_ID", "bot-id");
    vi.stubEnv("LINEWORKS_BOT_SECRET", "bot-secret");
    vi.stubEnv("LINEWORKS_CLIENT_ID", "client-id");

    expect(() => createLineWorksAdapter()).toThrow(ValidationError);
    expect(() => createLineWorksAdapter()).toThrow(
      "LINEWORKS_CLIENT_ID, LINEWORKS_CLIENT_SECRET, LINEWORKS_SERVICE_ACCOUNT, LINEWORKS_PRIVATE_KEY, and LINEWORKS_SCOPES are required for service account authentication."
    );
  });

  it("throws when bot credentials and auth env are missing", () => {
    expect(() => createLineWorksAdapter()).toThrow(ValidationError);
  });
});
