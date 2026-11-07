export interface RedactionDict {
  size: number;
  /** Normalised phrase ("oscar lindberg") → placeholder. */
  lookup: Map<string, string>;
  /** Longest phrase length in tokens. */
  maxTokens: number;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

const TOKEN = /[\p{L}\p{N}]+(?:[@.\-+_'][\p{L}\p{N}]+)*/gu;
const MAX_PHRASE_TOKENS = 6;

const PATTERNS: [RegExp, string][] = [
  [/\b\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]\b/gi, "[NATIONAL_ID]"],
  [/\b\d{6}\s*(?:streck|viiva|dash|[-+])\s*\d{3}\s*\d?\b/gi, "[NATIONAL_ID]"],
  [/\b(?:\d[ -]*?){13,19}\b/g, "[PAYMENT_CARD]"],
  [/\b\d{6,}\b/g, "[ACCOUNT_NUMBER]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi, "[EMAIL]"],
  [/(?:\+\d{2,3}[\s-]?|\b0)\d{1,3}[\s-]?\d{3,4}[\s-]?\d{2,4}\b/g, "[PHONE]"],
  [/\b[A-Z]{2}\d{2}(?: ?[0-9A-Z]{4}){2,7}(?: ?[0-9A-Z]{1,3})?\b/gi, "[IBAN]"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[IP_ADDRESS]"],
  [/https?:\/\/\S+/gi, "[URL]"],
];

/*
Split text into word tokens with their character positions.
*/
function tokenize(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => ({ text: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length }));
}

/*
Normalise a value to the same token form used when scanning text.
*/
export function phraseKey(value: string): string {
  return tokenize(value)
    .map((t) => t.text)
    .join(" ");
}

/*
Build a phrase dictionary used by redactText.
*/
export function makeDict(entries: Iterable<[string, string]>): RedactionDict {
  const lookup = new Map<string, string>();
  let maxTokens = 1;
  for (const [value, label] of entries) {
    const key = phraseKey(value);
    const n = key ? key.split(" ").length : 0;
    if (!n || n > MAX_PHRASE_TOKENS) continue;
    lookup.set(key, label);
    maxTokens = Math.max(maxTokens, n);
  }
  return { size: lookup.size, lookup, maxTokens };
}

/*
Redact identifiers in text with regex and dictionary placeholders.
*/
export function redactText(text: string, dict?: RedactionDict): string {
  if (!text) return "";
  let out = applyDict(text, dict);
  for (const [rx, label] of PATTERNS) out = out.replace(rx, label);
  return out;
}

/*
Replace the longest dictionary phrase at each token position with its placeholder.
*/
function applyDict(text: string, dict?: RedactionDict): string {
  if (!dict?.size) return text;
  const tokens = tokenize(text);
  let out = "";
  let cursor = 0;
  for (let i = 0; i < tokens.length; ) {
    const hit = longestMatch(tokens, i, dict);
    if (!hit) {
      i += 1;
      continue;
    }
    out += text.slice(cursor, tokens[i].start) + hit.label;
    cursor = tokens[i + hit.length - 1].end;
    i += hit.length;
  }
  return out + text.slice(cursor);
}

/*
Find the longest dictionary phrase starting at token i.
*/
function longestMatch(tokens: Token[], i: number, dict: RedactionDict): { label: string; length: number } | null {
  for (let n = Math.min(dict.maxTokens, tokens.length - i); n >= 1; n -= 1) {
    let key = tokens[i].text;
    for (let j = 1; j < n; j += 1) key += ` ${tokens[i + j].text}`;
    const label = dict.lookup.get(key);
    if (label) return { label, length: n };
  }
  return null;
}
