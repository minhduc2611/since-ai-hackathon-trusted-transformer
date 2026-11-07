import { createHmac } from "node:crypto";
import { config } from "../config.js";

/*
Compute a keyed HMAC-SHA256 pseudonym token.
*/
export function hmacToken(value: string, prefix = "", n = 16): string {
  if (!value) return "";
  const dig = createHmac("sha256", config.secret).update(value).digest("hex");
  return `${prefix}${dig.slice(0, n)}`;
}
