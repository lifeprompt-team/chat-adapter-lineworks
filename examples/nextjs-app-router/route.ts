import { Chat } from "chat";
import { createLineWorksAdapter } from "chat-adapter-lineworks";

const adapter = createLineWorksAdapter({
  botId: process.env.LINEWORKS_BOT_ID!,
  botSecret: process.env.LINEWORKS_BOT_SECRET!,
  accessToken: process.env.LINEWORKS_ACCESS_TOKEN!,
});

const chat = new Chat({
  adapters: [adapter],
});

export async function POST(request: Request) {
  return adapter.handleWebhook(request, {
    waitUntil: (promise) => promise.catch(console.error),
  });
}
