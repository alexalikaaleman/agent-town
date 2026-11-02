"use strict";

/**
 * Privacy filter for anything that can reach the public status page.
 * Bubble text is at most 40 characters. URLs, emails, file paths, and money
 * amounts are removed (never published).
 */

const MAX_TEXT = 40;

const TLDS =
  "com|net|org|io|dev|app|ai|co|us|gov|edu|me|ly|gg|xyz|info|biz|sh|to|tv|uk|ca|au|de|jp|fr|nz|site|online|store|page|link|cloud";
const FILE_EXT =
  "pdf|docx?|xlsx?|csv|tsv|txt|md|rtf|pptx?|key|pages|numbers|png|jpe?g|gif|webp|heic|svg|mov|mp4|m4a|mp3|wav|zip|tar|gz|7z|psd|sh|py|json|ya?ml|html?|env|log|sql|db|sqlite|pem|ini|cfg|toml";

const RULES = [
  ["email", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi],
  ["url", /\b(?:https?|ftp|file|sftp|ssh):\/\/\S*/gi],
  ["url", /\bwww\.\S+/gi],
  ["url", new RegExp("\\b[\\w-]+(?:\\.[\\w-]+)*\\.(?:" + TLDS + ")\\b(?:[/:?#]\\S*)?", "gi")],
  ["path", /[A-Za-z]:\\\S*/g],
  ["path", /\\\\\S+/g],
  ["path", /(?:^|(?<=[\s("'`=:]))(?:~|\.{1,2})?\/[^\s]*/g],
  ["path", /\b[\w.-]+(?:\/[\w.-]+){2,}\/?/g],
  ["path", new RegExp("\\b[\\w-]+(?:\\.[\\w-]+)*\\.(?:" + FILE_EXT + ")\\b", "gi")],
  ["money", /[$€£¥₹₩]\s?\d[\d,]*(?:\.\d+)?\s?(?:[kKmMbB]\b|million|billion|thousand)?/g],
  ["money", /\b(?:usd|eur|gbp|jpy|cad|aud|nzd|chf)\s?\d[\d,]*(?:\.\d+)?/gi],
  ["money", /\b\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|gbp|jpy|cad|aud|nzd|chf|dollars?|bucks|euros?|pounds?|yen|cents?)\b/gi],
  ["money", /[$€£¥₹₩]/g],
  // Long opaque ids (Drive ids, keys, tokens): 20+ chars mixing letters and digits.
  ["id", /\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{20,}\b/g],
];

/** Returns { text, removed: [kinds] }. Text is cleaned but not yet truncated. */
function stripPrivate(value) {
  let s = String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ");
  const removed = [];
  for (const [kind, re] of RULES) {
    re.lastIndex = 0;
    if (re.test(s)) {
      re.lastIndex = 0;
      s = s.replace(re, " ");
      if (!removed.includes(kind)) removed.push(kind);
    }
  }
  s = s
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:\-–—]+\s*/, "")
    .replace(/\s*[,;:\-–—]+$/, "")
    .trim();
  return { text: s, removed };
}

function truncate(s, max) {
  const limit = max || MAX_TEXT;
  const chars = Array.from(String(s));
  if (chars.length <= limit) return chars.join("");
  return chars.slice(0, limit - 1).join("").trimEnd() + "…";
}

/** Clean bubble text: strip private bits, then cut to 40 characters with an ellipsis. */
function cleanBubble(value, max) {
  return truncate(stripPrivate(value).text, max || MAX_TEXT);
}

/** True when a string still looks private (used by build checks). */
function looksPrivate(value) {
  return stripPrivate(value).removed.length > 0;
}

module.exports = { MAX_TEXT, stripPrivate, truncate, cleanBubble, looksPrivate };
