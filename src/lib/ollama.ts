import { config } from "../config.js";

/*
Call Ollama to generate a text completion.
*/
export async function generate(prompt: string, temperature = 0, maxTokens = 256): Promise<string> {
  const res = await fetch(config.ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      think: false,
      options: { temperature, num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(60_000 + maxTokens * 100),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response?: string };
  return String(data.response || "").trim();
}

/*
Ask Ollama for JSON and parse the reply.
*/
export async function generateJson<T>(prompt: string, maxTokens = 256): Promise<T> {
  const raw = await generate(`${prompt}\n\nReply with JSON only.`, 0, maxTokens);
  return parseJsonLoose<T>(raw);
}

/*
Extract and parse the first JSON object from model text.
*/
function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`No JSON in: ${text.slice(0, 120)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
