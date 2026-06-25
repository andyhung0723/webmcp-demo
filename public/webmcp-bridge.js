// Bridge: connects this page's WebMCP tools to the backend agent (a separate
// origin). It does NOT run the agent or hold any key. It:
//   1. reports the page's tool list to the backend over WebSocket,
//   2. executes tool calls the backend asks for, in this page's own session,
//   3. shows a floating panel to give the agent a task (POST /api/run).
//
// Backend origin is configurable via window.__WEBMCP_BACKEND__ (default :5174).
(function () {
  // Local/LAN dev only — never mount the panel or dial the backend in production.
  const pageHost = location.hostname || "";
  const isLocal =
    pageHost === "" ||
    /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(pageHost);
  if (!isLocal) return;

  // Only the "backend" demo mode mounts the panel + dials the backend.
  if (new URLSearchParams(location.search).get("mode") !== "backend") return;

  const BACKEND = (window.__WEBMCP_BACKEND__ || "http://localhost:5174").replace(/\/$/, "");
  const WS_URL = BACKEND.replace(/^http/, "ws");

  // --- floating panel, isolated from the app via shadow DOM --------------

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483647;";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .card { width: 360px; max-width: 90vw; background: #111827; color: #e5e7eb;
        border: 1px solid #374151; border-radius: 12px; padding: 12px;
        font: 13px/1.5 system-ui, sans-serif; box-shadow: 0 8px 30px #0007; }
      .hd { font-weight: 700; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 8px; }
      #status { font: 11px ui-monospace, monospace; opacity: 0.7; font-weight: 400; }
      textarea { width: 100%; min-height: 54px; resize: vertical; border-radius: 8px;
        border: 1px solid #374151; background: #0b1220; color: inherit; padding: 8px; font: inherit; }
      button { width: 100%; margin-top: 8px; padding: 8px; border: none; border-radius: 8px;
        background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
      button:disabled { opacity: 0.5; cursor: default; }
      #log { margin-top: 10px; max-height: 260px; overflow-y: auto; border-top: 1px solid #374151;
        padding-top: 8px; font: 12px/1.5 ui-monospace, monospace; }
      .line { padding: 2px 0; white-space: pre-wrap; word-break: break-word; }
      .line.goal { font-weight: 700; }
      .line.say { color: #93c5fd; }
      .line.res { opacity: 0.7; }
      .line.muted { opacity: 0.6; }
      .line.err { color: #f87171; }
    </style>
    <div class="card">
      <div class="hd"><span>🛰️ WebMCP backend agent</span><span id="status">connecting…</span></div>
      <textarea id="task">幫我找適合幼貓、預算 500 內、評分 4 以上的商品，挑一個加入購物車，再回報購物車總額。</textarea>
      <button id="run" disabled>▶ Run task (POST /api/run)</button>
      <div id="log"></div>
    </div>`;

  const $ = (id) => root.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function line(cls, html) {
    const d = document.createElement("div");
    d.className = "line " + cls;
    d.innerHTML = html;
    $("log").appendChild(d);
    $("log").scrollTop = $("log").scrollHeight;
  }

  // --- WebMCP consumer surface (page JS, via the shim) -------------------

  // Pick whichever namespace actually exposes the consumer surface.
  function mc() {
    for (const m of [document.modelContext, navigator.modelContext]) {
      if (m && typeof m.getTools === "function" && typeof m.executeTool === "function") return m;
    }
    return null;
  }

  async function toolList() {
    const surface = mc();
    if (!surface) return [];
    const tools = await surface.getTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async function execTool(name, input) {
    const surface = mc();
    if (!surface) throw new Error("no WebMCP consumer surface on this page");
    const res = await surface.executeTool(name, JSON.stringify(input));
    const text = (res?.content || []).map((c) => c.text ?? "").join("\n");
    return text || JSON.stringify(res);
  }

  // Tools register during Vue mount; poll until they appear.
  async function waitForTools() {
    for (let i = 0; i < 30; i++) {
      try {
        const t = await toolList();
        if (t.length) return t;
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 200));
    }
    return [];
  }

  // --- WebSocket bridge to the backend agent -----------------------------

  let sessionId = null;

  function connect() {
    const ws = new WebSocket(WS_URL);

    ws.addEventListener("open", async () => {
      const tools = await waitForTools();
      ws.send(JSON.stringify({ type: "register", tools }));
      line("muted", `🔧 ${tools.map((t) => t.name).join(", ") || "(no tools registered)"}`);
    });

    ws.addEventListener("close", () => {
      $("status").textContent = "disconnected";
      $("run").disabled = true;
    });

    ws.addEventListener("error", () => {
      $("status").textContent = `cannot reach ${BACKEND}`;
    });

    ws.addEventListener("message", async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "ready") {
        sessionId = msg.sessionId;
        $("status").textContent = `registering tools…`;
      } else if (msg.type === "registered") {
        // Only now does the backend know our tools — safe to run.
        $("status").textContent = `connected · ${sessionId} · ${msg.count} tools`;
        $("run").disabled = false;
      } else if (msg.type === "tool_call") {
        let content;
        let isError = false;
        try {
          content = await execTool(msg.name, msg.input);
        } catch (e) {
          content = String(e?.message || e);
          isError = true;
        }
        ws.send(JSON.stringify({ type: "tool_result", id: msg.id, content, isError }));
      } else if (msg.type === "step") {
        renderStep(msg);
      }
    });
  }

  function renderStep(s) {
    if (s.kind === "goal") line("goal", `🎯 ${esc(s.text)}`);
    else if (s.kind === "say") line("say", `🤖 ${esc(s.text)}`);
    else if (s.kind === "call")
      line("call", `↳ <b>${esc(s.name)}</b>(${esc(JSON.stringify(s.input))})`);
    else if (s.kind === "result")
      line(s.isError ? "err" : "res", `&nbsp;&nbsp;= ${esc(s.content)}`);
  }

  $("run").addEventListener("click", async () => {
    $("run").disabled = true;
    try {
      const r = await fetch(`${BACKEND}/api/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, task: $("task").value }),
      });
      const data = await r.json();
      if (data.error) line("err", `❌ ${esc(data.error)}`);
    } catch (e) {
      line("err", `❌ ${esc(e?.message || e)}`);
    } finally {
      $("run").disabled = false;
    }
  });

  connect();
})();
