// Backend agent for WebMCP.
//
// The API key and the LLM tool-use loop live here; the agent is invoked over an
// HTTP API (POST /api/run). WebMCP tools live in the *browser* (their execute
// handlers run in the user's session), so a WebSocket bridge runs each tool call
// back in the page and returns the result.
//
//   browser  --register(tool schemas)-->  backend
//   POST /api/run {sessionId, task}   -->  backend runs Claude
//     tool_use  --tool_call (ws)-->  browser executeTool  --tool_result-->  backend
//
// Without ANTHROPIC_API_KEY the loop falls back to a scripted call so the full
// bridge can be verified with no key. The frontend is served separately (Vite),
// so this server is API + WebSocket only.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the project root. Existing shell env wins, so
// `ANTHROPIC_API_KEY=... npm run backend` still overrides the file.
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(val)) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.join(__dirname, "..", ".env"));

const PORT = process.env.PORT || 5174;
const MODEL = process.env.AGENT_MODEL || "claude-sonnet-4-6";

// sessionId -> { ws, tools, pending: Map<callId, resolve> }
const sessions = new Map();

// --- HTTP: the agent API -------------------------------------------------

// The frontend lives on a different origin (Vite dev server), so the API is
// CORS-enabled. WebSocket isn't subject to CORS.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(obj));
};

const httpServer = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method === "POST" && req.url === "/api/run") return handleRun(req, res);
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain", ...CORS });
    return res.end("WebMCP backend agent. POST /api/run, WS for the tool bridge.");
  }
  res.writeHead(404, CORS).end("not found");
});

function handleRun(req, res) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { sessionId, task } = JSON.parse(body || "{}");
      const sess = sessions.get(sessionId);
      if (!sess) return json(res, 404, { error: "no such session (browser tab not connected)" });
      const result = await runAgent(sess, task);
      json(res, 200, result);
    } catch (e) {
      json(res, 500, { error: String(e?.message || e) });
    }
  });
}

// --- WebSocket: the bridge to the browser session ------------------------

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const sessionId = randomUUID().slice(0, 8);
  const sess = { ws, tools: [], pending: new Map() };
  sessions.set(sessionId, sess);

  ws.on("message", (buf) => {
    const msg = JSON.parse(buf.toString());
    if (msg.type === "register") {
      sess.tools = msg.tools || [];
      ws.send(JSON.stringify({ type: "registered", count: sess.tools.length }));
    } else if (msg.type === "tool_result") {
      const resolve = sess.pending.get(msg.id);
      if (resolve) {
        sess.pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  ws.on("close", () => sessions.delete(sessionId));

  ws.send(JSON.stringify({ type: "ready", sessionId }));
});

const emit = (sess, event) => {
  if (sess.ws.readyState === 1) sess.ws.send(JSON.stringify({ type: "step", ...event }));
};

// Ask the browser to run a tool in its own session, await the result.
function bridgeToolCall(sess, name, input) {
  return new Promise((resolve, reject) => {
    const id = randomUUID().slice(0, 8);
    const timer = setTimeout(() => {
      sess.pending.delete(id);
      reject(new Error("tool call timed out (browser not responding)"));
    }, 15000);
    sess.pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    sess.ws.send(JSON.stringify({ type: "tool_call", id, name, input }));
  });
}

// --- agent loop ----------------------------------------------------------

async function runAgent(sess, task) {
  emit(sess, { kind: "goal", text: task });
  return process.env.ANTHROPIC_API_KEY ? runWithClaude(sess, task) : runScripted(sess);
}

async function runWithClaude(sess, task) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();

  // WebMCP inputSchema maps 1:1 onto Anthropic input_schema.
  const tools = sess.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const messages = [{ role: "user", content: task }];

  for (let turn = 0; turn < 10; turn++) {
    const res = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
    messages.push({ role: "assistant", content: res.content });

    for (const b of res.content) {
      if (b.type === "text" && b.text.trim()) emit(sess, { kind: "say", text: b.text.trim() });
    }

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) break;

    const results = [];
    for (const use of toolUses) {
      emit(sess, { kind: "call", name: use.name, input: use.input });
      let content;
      let isError = false;
      try {
        const reply = await bridgeToolCall(sess, use.name, use.input);
        content = reply.content;
        isError = !!reply.isError;
      } catch (e) {
        content = String(e?.message || e);
        isError = true;
      }
      emit(sess, { kind: "result", content, isError });
      results.push({ type: "tool_result", tool_use_id: use.id, content, is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }

  const answer = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.content)
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { answer };
}

// No key: prove the bridge without an LLM. Frontend-agnostic — calls the first
// registered tool that needs no required args.
async function runScripted(sess) {
  emit(sess, { kind: "say", text: "(no ANTHROPIC_API_KEY — scripted agent, proving the backend↔browser bridge)" });

  const safe = sess.tools.find((t) => !(t.inputSchema?.required?.length)) || sess.tools[0];
  if (!safe) return { answer: "(no tools registered)" };

  emit(sess, { kind: "call", name: safe.name, input: {} });
  const reply = await bridgeToolCall(sess, safe.name, {});
  emit(sess, { kind: "result", content: reply.content, isError: !!reply.isError });
  return { answer: reply.content };
}

httpServer.listen(PORT, () => {
  const mode = process.env.ANTHROPIC_API_KEY ? `Claude (${MODEL})` : "scripted (no key)";
  console.log(`\n  WebMCP backend agent [${mode}] → http://localhost:${PORT}/\n`);
});
