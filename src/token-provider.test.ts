import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthenticationError, ValidationError } from "@chat-adapter/shared";
import { ServiceAccountLineWorksTokenProvider } from "./token-provider";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const privateKeyPem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;
const publicKeyPem = publicKey.export({
  format: "pem",
  type: "spki",
}) as string;

describe("ServiceAccountLineWorksTokenProvider", () => {
  it("requests and caches access tokens", async () => {
    let now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "token-1",
            expires_in: "3600",
            token_type: "Bearer",
          }),
          { status: 200 }
        )
      )
    );
    const provider = new ServiceAccountLineWorksTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch: fetchMock,
      now: () => now,
      privateKey: privateKeyPem,
      scopes: ["bot.message", "bot.read"],
      serviceAccount: "service@example.com",
    });

    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    await expect(provider.getAccessToken()).resolves.toBe("token-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 60 * 60 * 1000;
    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds an RS256 JWT assertion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "token-1",
          expires_in: "3600",
          token_type: "Bearer",
        }),
        { status: 200 }
      )
    );
    const provider = new ServiceAccountLineWorksTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch: fetchMock,
      now: () => 1_767_225_600_000,
      privateKey: privateKeyPem.replace(/\n/g, "\\n"),
      scopes: "bot.message,bot.read",
      serviceAccount: "service@example.com",
    });

    await provider.getAccessToken();

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    const assertion = body.get("assertion");
    expect(assertion).toBeTruthy();
    const [encodedHeader, encodedPayload, signature] = assertion!.split(".");
    expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"))).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))).toEqual({
      exp: 1_767_229_200,
      iat: 1_767_225_600,
      iss: "client-id",
      sub: "service@example.com",
    });

    const verify = createVerify("RSA-SHA256");
    verify.update(`${encodedHeader}.${encodedPayload}`);
    expect(verify.verify(publicKeyPem, signature, "base64url")).toBe(true);
    expect(body.get("scope")).toBe("bot.message bot.read");
  });

  it("rejects incomplete service account config", () => {
    expect(
      () =>
        new ServiceAccountLineWorksTokenProvider({
          clientId: "client-id",
          clientSecret: "client-secret",
          privateKey: "",
          scopes: "bot.message",
          serviceAccount: "service@example.com",
        })
    ).toThrow(ValidationError);
  });

  it("maps token endpoint failures to authentication errors", async () => {
    const provider = new ServiceAccountLineWorksTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch: vi.fn().mockResolvedValue(new Response("bad", { status: 401 })),
      privateKey: privateKeyPem,
      scopes: "bot.message",
      serviceAccount: "service@example.com",
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
