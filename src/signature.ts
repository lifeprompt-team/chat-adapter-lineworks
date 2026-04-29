import { createHmac, timingSafeEqual } from "node:crypto";

export function createLineWorksSignature(
  rawBody: string,
  botSecret: string
): string {
  return createHmac("sha256", botSecret).update(rawBody).digest("base64");
}

export function verifyLineWorksSignature(
  rawBody: string,
  botSecret: string,
  signature: string | null
): boolean {
  if (!signature) {
    return false;
  }

  const expected = createLineWorksSignature(rawBody, botSecret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
