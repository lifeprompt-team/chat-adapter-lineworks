# LINE WORKS setup

This adapter receives LINE WORKS Bot callbacks and sends messages through the LINE WORKS Bot API.

## Required values

Configure these values in your application:

```text
LINEWORKS_BOT_ID
LINEWORKS_BOT_SECRET
```

For local testing, you can also set:

```text
LINEWORKS_ACCESS_TOKEN
```

For runtime use, prefer the service account environment variables so the adapter can request and cache access tokens:

```text
LINEWORKS_CLIENT_ID
LINEWORKS_CLIENT_SECRET
LINEWORKS_SERVICE_ACCOUNT
LINEWORKS_PRIVATE_KEY
LINEWORKS_SCOPES
```

`LINEWORKS_BOT_USER_NAME` is optional.

`LINEWORKS_BOT_USER_ID` is optional. When set, channel messages containing `<m userId="...">` tags that reference this user ID are treated as mentions.

`LINEWORKS_TREAT_CHANNEL_MESSAGES_AS_MENTIONS=true` treats all inbound channel text messages as mentions.

All five service account variables are required when any one of them is set. If `LINEWORKS_ACCESS_TOKEN` is set, the adapter uses it directly and does not build a service account token provider.

## Callback URL

Set your application's webhook endpoint as the Bot callback URL in the LINE WORKS Developer Console.

The callback endpoint must be HTTPS. LINE WORKS does not accept self-signed certificates for production callback URLs.

## Signature verification

The adapter verifies each callback before parsing the JSON body:

1. Read `X-WORKS-BotId` and compare it with the configured Bot ID.
2. Read the raw request body.
3. Create an HMAC-SHA256 digest with the Bot Secret.
4. Base64 encode the digest.
5. Compare the result with `X-WORKS-Signature`.

Do not parse and re-stringify the request body before verification. Whitespace changes will invalidate the signature.

## Message routing

Direct messages and channel messages use different LINE WORKS Bot API endpoints. The adapter represents them as stable Chat SDK thread IDs:

```text
lineworks:user:{base64url(userId)}
lineworks:channel:{base64url(channelId)}
```

`domainId` is preserved in raw event metadata where available, but it is not encoded into the thread ID because LINE WORKS send endpoints route by `botId` plus `userId` or `channelId`.

LINE WORKS does not expose Slack-style message reply threads through the Bot API. The thread ID represents the destination conversation, not a message-level reply thread. Callback payloads do not include reply-to message metadata.

## Message IDs

Inbound and outbound Chat SDK message IDs are adapter-generated stable hashes or synthetic IDs. They are not the official LINE WORKS `messageId` returned by the Bot API.

## Outbound text limits

Outbound plain text over 2,000 characters throws `ValidationError` instead of being split automatically.

Plain `string` and `{ raw: string }` messages are trimmed at both ends only. Internal newlines are preserved.

When a Chat SDK Card contains buttons, only the Card body is sent as `contentText`. Any outer message text, markdown, or raw text on the same post is ignored.

Chat SDK Card button templates have separate limits:

- Content text: 1,000 characters or fewer.
- Actions: 10 or fewer.
- Button labels: 20 characters or fewer.
- Message action postback: 1,000 characters or fewer.

Button taps from button templates return a `message` callback with `content.postback`. Standalone `postback` callbacks from other templates are also supported.

## Current feature scope

Supported:

- Callback signature verification.
- Inbound text messages.
- Inbound file-like messages with `fileId` exposed as lazy attachments.
- Outbound text messages.
- Outbound uploaded file and image messages.
- Direct user messages and channel messages.
- Service Account JWT token acquisition and caching.
- Chat SDK Card buttons rendered as LINE WORKS button templates.
- Button template taps and standalone postback callbacks dispatched as Chat SDK action events.
- Stable thread ID encode/decode.
- Basic HTTP error mapping.

Not supported yet:

- Rich templates beyond basic button templates.
- Message history fetching.
- Typing indicators.
- Message edit/delete.
- Reactions.
