import { AuthenticationError, NetworkError, ValidationError } from "@chat-adapter/shared";
import { createSign } from "node:crypto";

const DEFAULT_TOKEN_ENDPOINT = "https://auth.worksmobile.com/oauth2/v2.0/token";
const JWT_BEARER_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const DEFAULT_TOKEN_EXPIRES_MARGIN_SECONDS = 60;
const DEFAULT_JWT_LIFETIME_SECONDS = 60 * 60;

export interface LineWorksTokenProvider {
  getAccessToken(): Promise<string>;
}

export class StaticLineWorksTokenProvider implements LineWorksTokenProvider {
  constructor(private readonly accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

export interface ServiceAccountLineWorksTokenProviderConfig {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  jwtLifetimeSeconds?: number;
  now?: () => number;
  privateKey: string;
  scopes: readonly string[] | string;
  serviceAccount: string;
  tokenEndpoint?: string;
  tokenExpiresMarginSeconds?: number;
}

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

type LineWorksTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

export class ServiceAccountLineWorksTokenProvider implements LineWorksTokenProvider {
  private cachedToken: CachedToken | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly jwtLifetimeSeconds: number;
  private readonly now: () => number;
  private readonly scopes: string;
  private readonly tokenEndpoint: string;
  private readonly tokenExpiresMarginSeconds: number;

  constructor(private readonly config: ServiceAccountLineWorksTokenProviderConfig) {
    validateServiceAccountConfig(config);
    this.fetchImpl = config.fetch ?? fetch;
    this.jwtLifetimeSeconds = config.jwtLifetimeSeconds ?? DEFAULT_JWT_LIFETIME_SECONDS;
    this.now = config.now ?? Date.now;
    this.scopes = normalizeScopes(config.scopes);
    this.tokenEndpoint = config.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;
    this.tokenExpiresMarginSeconds =
      config.tokenExpiresMarginSeconds ?? DEFAULT_TOKEN_EXPIRES_MARGIN_SECONDS;
  }

  async getAccessToken(): Promise<string> {
    const nowMs = this.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > nowMs) {
      return this.cachedToken.accessToken;
    }

    const response = await this.requestAccessToken();
    const accessToken = parseAccessToken(response);
    const expiresInSeconds = parseExpiresInSeconds(response);
    this.cachedToken = {
      accessToken,
      expiresAtMs:
        nowMs + Math.max(0, expiresInSeconds - this.tokenExpiresMarginSeconds) * 1000,
    };

    return accessToken;
  }

  private async requestAccessToken(): Promise<LineWorksTokenResponse> {
    const body = new URLSearchParams({
      assertion: this.createAssertion(),
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: JWT_BEARER_GRANT_TYPE,
      scope: this.scopes,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.tokenEndpoint, {
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        method: "POST",
      });
    } catch (error) {
      throw new NetworkError(
        "lineworks",
        "Failed to request LINE WORKS access token",
        error instanceof Error ? error : undefined
      );
    }

    if (!response.ok) {
      throw new AuthenticationError("lineworks", await readTokenError(response));
    }

    return (await response.json()) as LineWorksTokenResponse;
  }

  private createAssertion(): string {
    const nowSeconds = Math.floor(this.now() / 1000);
    const header = base64UrlEncodeJson({
      alg: "RS256",
      typ: "JWT",
    });
    const payload = base64UrlEncodeJson({
      exp: nowSeconds + this.jwtLifetimeSeconds,
      iat: nowSeconds,
      iss: this.config.clientId,
      sub: this.config.serviceAccount,
    });
    const signingInput = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(normalizePrivateKey(this.config.privateKey), "base64url");

    return `${signingInput}.${signature}`;
  }
}

function validateServiceAccountConfig(
  config: ServiceAccountLineWorksTokenProviderConfig
): void {
  if (!config.clientId) {
    throw new ValidationError("lineworks", "clientId is required");
  }
  if (!config.clientSecret) {
    throw new ValidationError("lineworks", "clientSecret is required");
  }
  if (!config.serviceAccount) {
    throw new ValidationError("lineworks", "serviceAccount is required");
  }
  if (!config.privateKey) {
    throw new ValidationError("lineworks", "privateKey is required");
  }
  if (normalizeScopes(config.scopes).length === 0) {
    throw new ValidationError("lineworks", "scopes is required");
  }
}

function normalizeScopes(scopes: readonly string[] | string): string {
  if (typeof scopes === "string") {
    return scopes
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
      .join(" ");
  }
  return scopes
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(" ");
}

function parseAccessToken(response: LineWorksTokenResponse): string {
  if (typeof response.access_token !== "string" || response.access_token.length === 0) {
    throw new AuthenticationError("lineworks", "LINE WORKS token response is missing access_token");
  }
  return response.access_token;
}

function parseExpiresInSeconds(response: LineWorksTokenResponse): number {
  const parsed = Number(response.expires_in);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

async function readTokenError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || response.statusText || `HTTP ${response.status}`;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}
