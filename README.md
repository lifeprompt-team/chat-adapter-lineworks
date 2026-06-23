# chat-adapter-lineworks

LINE WORKS adapter for [Chat SDK](https://chat-sdk.dev/).

Receive LINE WORKS Bot callbacks and send LINE WORKS messages from Chat SDK handlers.

> Alpha: this package is ready for early testing, but it has not yet been verified against every LINE WORKS callback and Bot API response shape.

## Install

```sh
npm install chat chat-adapter-lineworks
```

## Usage

```ts
import { Chat } from "chat";
import { createLineWorksAdapter } from "chat-adapter-lineworks";

const lineworks = createLineWorksAdapter({
  botId: process.env.LINEWORKS_BOT_ID!,
  botSecret: process.env.LINEWORKS_BOT_SECRET!,
});

const chat = new Chat({
  adapters: [lineworks],
});
```

## Next.js App Router webhook

```ts
export async function POST(request: Request) {
  return lineworks.handleWebhook(request, {
    waitUntil: (task) => task.catch(console.error),
  });
}
```

The adapter verifies `X-WORKS-BotId` and `X-WORKS-Signature` before parsing JSON. The signature check uses the raw request body, not a parsed and re-stringified object.

## Environment variables

`createLineWorksAdapter()` can read:

```text
LINEWORKS_BOT_ID
LINEWORKS_BOT_SECRET
LINEWORKS_ACCESS_TOKEN
LINEWORKS_CLIENT_ID
LINEWORKS_CLIENT_SECRET
LINEWORKS_SERVICE_ACCOUNT
LINEWORKS_PRIVATE_KEY
LINEWORKS_SCOPES
LINEWORKS_BOT_USER_NAME
```

`LINEWORKS_ACCESS_TOKEN` is still supported for local testing. For runtime use,
prefer the service account environment variables so the adapter can request and
cache access tokens.

See [docs/setup.md](docs/setup.md) for LINE WORKS callback and routing details.

## Supported

- Callback signature verification.
- LINE WORKS `message` events with text and file-like attachment content.
- Direct user messages and channel messages.
- `postMessage()` for LINE WORKS text and uploaded file/image messages.
- `openDM()` and `isDM()`.
- Service Account JWT token acquisition and caching.
- Channel detail and channel member list client primitives.
- Bot attachment upload and download client primitives.
- Chat SDK Card buttons rendered as LINE WORKS button templates.
- Postback callbacks dispatched as Chat SDK action events.
- Stable thread ID encode/decode.
- Basic HTTP error mapping.

## Not supported yet

- Rich templates beyond basic button templates.
- Message history fetching.
- Typing indicators.
- Message edit/delete.
- Reactions.

## Thread IDs

Thread IDs represent the LINE WORKS destination, not message-level reply threads.

```text
lineworks:user:{base64url(userId)}
lineworks:channel:{base64url(channelId)}
```

`domainId` is preserved in raw event metadata where available, but it is not encoded into the thread ID because LINE WORKS send endpoints route by `botId` plus `userId` or `channelId`.

## Message behavior

- 1:1 messages are treated as mentions.
- Channel messages are not treated as mentions by default.
- Set `treatChannelMessagesAsMentions: true` if your bot should process all channel text messages.
- File-like non-text events with `fileId` are exposed as lazy attachments.
- Other non-text events are logged and ignored.
- Outbound text over 2,000 characters throws `ValidationError` instead of being split automatically.

## Development

This package depends on Chat SDK primitives:

- `chat` is a peer dependency.
- `@chat-adapter/shared` provides shared adapter errors and helpers.
- LINE WORKS-specific API and webhook behavior lives in this package.

```text
src/
  adapter.ts
  client.ts
  errors.ts
  factory.ts
  format-converter.ts
  index.ts
  signature.ts
  thread-id.ts
  token-provider.ts
  types.ts
  webhook.ts
```

## License

MIT
