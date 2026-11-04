// Second Look server.
// It does two jobs:
//   1. Serves the web page (the files in the "public" folder).
//   2. Checks text or images with Claude (using live web search) and sends back the result.
// The API key is read from the .env file and never leaves this server.
// Privacy: nothing people send is saved or logged. Each check is forgotten once the answer is sent.

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { textPrompt, imagePrompt, replyPrompt, REGIONS, LANGUAGES } from "./prompts.js";

const PORT = Number(process.env.PORT) || 3000;
// Normally only this computer can open the app. "npm run phone" also lets phones on the same Wi-Fi open it.
const ON_WIFI = process.argv.includes("--wifi");
const MODEL = process.env.MODEL || "claude-opus-5-5";
const LIVE = Boolean(process.env.ANTHROPIC_API_KEY);
const client = LIVE ? new Anthropic() : null;

// If Claude declines a request for safety reasons, these models can retry it on another model automatically.
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"];

const MAX_TEXT = 6000;               // characters
const MAX_CAPTION = 6000;            // characters (text added alongside a picture)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// ---------- trusted sources ----------
const SOURCES = JSON.parse(readFileSync(new URL("./sources.json", import.meta.url), "utf8")).sources;
const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
const SOURCE_IDS = SOURCES.filter((s) => !s.imageOnly)
  .map((s) => (s.region ? `${s.id} (${s.region})` : s.id))
  .join(", ");

function searchUrl(source, query) {
  const q = String(query || "").slice(0, 200);
  if (source.search) return source.search.replace("{q}", encodeURIComponent(q));
  return "https://www.google.com/search?q=" + encodeURIComponent(`site:${source.domains[0]} ${q}`);
}

// A link is only trusted if Claude's web search actually returned it AND it is on that source's own website.
function isTrustedLink(url, source, searchedUrls) {
  if (!url || !searchedUrls.has(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && source.domains.some((d) => u.hostname === d || u.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

// ---------- talking to Claude ----------
class CheckError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function askClaude(content, { search }) {
  const messages = [{ role: "user", content }];
  const searchedUrls = new Set();

  // A long web search can pause part-way; we let it continue up to a few times.
  for (let round = 0; round < 4; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: search ? "medium" : "low" },
      // web_search finds fact-checks and news; web_fetch lets Claude open a link the person pasted.
      ...(search && {
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 5 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
        ],
      }),
      ...(FALLBACK_MODELS.includes(MODEL) && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
      messages,
    });

    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.url) searchedUrls.add(r.url);
      }
    }

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") throw new CheckError("refused");
    if (response.stop_reason === "max_tokens") throw new CheckError("invalid_json");

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, searchedUrls };
  }
  throw new CheckError("took_too_long");
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new CheckError("invalid_json");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new CheckError("invalid_json");
  }
}

const TEXT_VERDICTS = ["likely_true", "likely_false", "misleading", "unverified"];
const IMAGE_VERDICTS = ["likely_authentic", "likely_ai", "likely_edited", "cant_tell"];

// Turn Claude's answer into the exact shape the app promises, and replace any untrusted link.
function cleanResult(raw, kind, searchedUrls) {
  // A screenshot of a post is judged like text, so image checks may use either set of verdicts.
  const verdicts = kind === "image" ? [...TEXT_VERDICTS, ...IMAGE_VERDICTS] : TEXT_VERDICTS;
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const signals = (Array.isArray(raw.signals) ? raw.signals : [])
    .filter((s) => s && (s.type === "support" || s.type === "concern") && str(s.text))
    .slice(0, 5)
    .map((s) => ({ type: s.type, text: str(s.text) }));

  const sources = [];
  for (const s of Array.isArray(raw.sources) ? raw.sources : []) {
    const source = s && SOURCE_BY_ID[s.id];
    if (!source || sources.some((x) => x.id === source.id)) continue;
    const url = isTrustedLink(s.url, source, searchedUrls) ? s.url : searchUrl(source, s.query);
    sources.push({ id: source.id, name: source.name, url, why: str(s.why) });
  }
  // Principle 4: always offer reverse image search for images.
  if (kind === "image" && !sources.some((s) => SOURCE_BY_ID[s.id].imageOnly)) {
    const tineye = SOURCE_BY_ID.tineye;
    sources.unshift({ id: "tineye", name: tineye.name, url: tineye.search, why: "See where this image first appeared" });
  }

  return {
    verdict: verdicts.includes(raw.verdict) ? raw.verdict : kind === "image" ? "cant_tell" : "unverified",
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0))),
    headline: str(raw.headline),
    explanation: str(raw.explanation),
    signals,
    sources: sources.slice(0, 3),
    tip: str(raw.tip),
  };
}

function settingsFrom(body) {
  return {
    region: REGIONS.includes(body.region) ? body.region : "auto",
    lang: LANGUAGES.includes(body.lang) ? body.lang : "same",
  };
}

// ---------- web routes ----------
const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

app.get("/api/status", (req, res) => {
  res.json({ live: LIVE, sources: SOURCES });
});

app.post("/api/check", async (req, res) => {
  if (!LIVE) return res.status(503).json({ error: "no_key" });
  const body = req.body || {};
  const { region, lang } = settingsFrom(body);
  try {
    let content, kind;
    if (body.kind === "image") {
      kind = "image";
      const { data, mediaType } = body.image || {};
      const caption = typeof body.caption === "string" ? body.caption.trim() : "";
      if (!IMAGE_TYPES.includes(mediaType) || typeof data !== "string") throw new CheckError("image_rejected");
      if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) throw new CheckError("image_rejected");
      if (caption.length > MAX_CAPTION) throw new CheckError("too_long");
      content = [
        { type: "image", source: { type: "base64", media_type: mediaType, data } },
        { type: "text", text: imagePrompt({ caption, region, lang, sourceIds: SOURCE_IDS }) },
      ];
    } else {
      kind = "text";
      const claim = typeof body.text === "string" ? body.text.trim() : "";
      if (!claim) throw new CheckError("empty");
      if (claim.length > MAX_TEXT) throw new CheckError("too_long");
      content = textPrompt({ claim, region, lang, sourceIds: SOURCE_IDS });
    }
    const { text, searchedUrls } = await askClaude(content, { search: true });
    res.json(cleanResult(parseJson(text), kind, searchedUrls));
  } catch (e) {
    sendError(res, e);
  }
});

app.post("/api/reply", async (req, res) => {
  if (!LIVE) return res.status(503).json({ error: "no_key" });
  const body = req.body || {};
  const { lang } = settingsFrom(body);
  const result = body.result || {};
  try {
    const content = String(body.content || "");
    const caption = String(body.caption || "");
    if (content.length > MAX_TEXT || caption.length > MAX_CAPTION) throw new CheckError("too_long");
    const prompt = replyPrompt({
      kind: body.kind === "image" ? "image" : "text",
      content,
      caption,
      platform: String(body.platform || "").slice(0, 60),
      result: {
        verdict: String(result.verdict || ""),
        confidence: Number(result.confidence) || 0,
        headline: String(result.headline || ""),
        explanation: String(result.explanation || ""),
      },
      lang,
      sourceNames: (Array.isArray(result.sources) ? result.sources : [])
        .map((s) => SOURCE_BY_ID[s && s.id]?.name)
        .filter(Boolean),
    });
    const { text } = await askClaude(prompt, { search: false });
    res.json({ text: text.trim() });
  } catch (e) {
    sendError(res, e);
  }
});

// Explain problems with short codes the web page turns into friendly messages.
// We log only the type of problem, never what the person sent.
function sendError(res, e) {
  if (e instanceof CheckError) return res.status(400).json({ error: e.code });
  if (e instanceof Anthropic.AuthenticationError) {
    console.error("The API key was rejected. Check ANTHROPIC_API_KEY in .env.");
    return res.status(502).json({ error: "bad_key" });
  }
  if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
  if (e instanceof Anthropic.BadRequestError) {
    console.error("Claude API rejected the request:", e.message);
    return res.status(502).json({ error: "server_error" });
  }
  if (e instanceof Anthropic.APIConnectionError) {
    console.error("Could not reach the Claude API:", e.message);
    return res.status(502).json({ error: "connection" });
  }
  if (e instanceof Anthropic.APIError) {
    console.error(`Claude API error ${e.status}:`, e.message);
    return res.status(502).json({ error: "server_error" });
  }
  console.error("Unexpected problem:", e && e.message);
  res.status(500).json({ error: "server_error" });
}

app.listen(PORT, ON_WIFI ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Second Look is running. Open http://localhost:${PORT} in your browser.`);
  if (ON_WIFI) {
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal)
      .map((n) => n.address);
    console.log("Phone mode is ON: phones on the same Wi-Fi can open it at:");
    for (const a of addresses) console.log(`   http://${a}:${PORT}`);
  }
  console.log(LIVE ? `Live checks are ON (model: ${MODEL}).` : "No API key found, so it's in EXAMPLE MODE (sample posts only, no cost).");
  console.log("Press Ctrl+C in this window to stop it.");
});
