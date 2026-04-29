# LINE WORKS setup

This adapter receives LINE WORKS Bot callbacks and sends text messages through the LINE WORKS Bot API.

## Required values

Configure these values in your application:

```text
LINEWORKS_BOT_ID
LINEWORKS_BOT_SECRET
LINEWORKS_ACCESS_TOKEN
```

`LINEWORKS_BOT_USER_NAME` is optional.

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

LINE WORKS does not expose Slack-style message reply threads through the Bot API, so the thread ID represents the destination conversation.

## Current feature scope

Supported:

- Inbound text messages.
- Outbound text messages.
- Direct user messages.
- Channel messages.

Not supported yet:

- Service Account JWT token acquisition.
- Files and attachments.
- Templates and buttons.
- Postback actions.
- Message history fetching.
- Typing indicators.
- Message edit/delete.
- Reactions.
