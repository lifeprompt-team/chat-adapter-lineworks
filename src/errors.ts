import {
  AdapterError,
  AdapterRateLimitError,
  AuthenticationError,
  NetworkError,
  PermissionError,
  ResourceNotFoundError,
  ValidationError,
} from "@chat-adapter/shared";

const ADAPTER_NAME = "lineworks";

export async function mapLineWorksResponseError(
  response: Response,
  resourceId?: string
): Promise<AdapterError> {
  const bodyText = await safeReadText(response);
  const message = bodyText || response.statusText || `HTTP ${response.status}`;

  switch (response.status) {
    case 400:
      return new ValidationError(ADAPTER_NAME, message);
    case 401:
      return new AuthenticationError(ADAPTER_NAME, message);
    case 403:
      return new PermissionError(ADAPTER_NAME, "call LINE WORKS Bot API");
    case 404:
      return new ResourceNotFoundError(
        ADAPTER_NAME,
        "LINE WORKS resource",
        resourceId
      );
    case 429:
      return new AdapterRateLimitError(
        ADAPTER_NAME,
        parseRetryAfter(response.headers)
      );
    default:
      if (response.status >= 500) {
        return new NetworkError(ADAPTER_NAME, message);
      }
      return new AdapterError(message, ADAPTER_NAME, String(response.status));
  }
}

function parseRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return seconds;
    }
  }

  const reset = headers.get("RateLimit-Reset");
  if (!reset) {
    return undefined;
  }

  const resetSeconds = Number(reset);
  if (!Number.isFinite(resetSeconds)) {
    return undefined;
  }

  return Math.max(0, resetSeconds - Math.floor(Date.now() / 1000));
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
