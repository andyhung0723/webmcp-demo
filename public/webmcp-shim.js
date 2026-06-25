// WebMCP shim for this benchmark app.
//
// The app registers tools via navigator.modelContext.registerTool but ships no
// consumer side (getTools/executeTool). We must provide that so a backend agent
// can enumerate and call the page's tools.
//
// The hard case: a browser with NATIVE WebMCP (flag/origin-trial) already has a
// provider-only navigator.modelContext that is non-configurable. We can't replace
// it, and if we put our own empty registry on document we get a split brain (app
// registers into native, bridge reads our empty document) -> 0 tools.
//
// Fix: one shared registry. If we can take over a namespace, do. Where native is
// immovable, WRAP its registerTool so registrations mirror into our registry.
// Consumer calls (getTools/executeTool) always read the shared registry.
(function () {
  // Local/LAN dev only. Inert on production hosts (e.g. github.io).
  const host = (typeof location !== "undefined" && location.hostname) || "";
  const isLocal =
    host === "" ||
    /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(host);
  if (!isLocal) {
    console.log("[webmcp-shim] non-local host — skipping (native path).");
    return;
  }

  const nav = typeof navigator !== "undefined" ? navigator : null;
  const doc = typeof document !== "undefined" ? document : null;

  // If a full consumer surface already exists where the bridge looks, step aside.
  const existing = doc && doc.modelContext;
  if (existing && typeof existing.getTools === "function" && typeof existing.executeTool === "function") {
    console.log("[webmcp-shim] full native consumer surface present — not shimming.");
    return;
  }

  // Capture any pre-existing (provider-only) native object before we shadow it.
  const nativeNav = nav && nav.modelContext;

  const registry = new Map();

  function toMcpResult(raw) {
    if (raw && Array.isArray(raw.content)) return raw;
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    return { content: [{ type: "text", text }] };
  }

  function record(def, opts) {
    if (!def || !def.name || typeof def.execute !== "function") {
      throw new TypeError("registerTool requires { name, execute }");
    }
    registry.set(def.name, {
      name: def.name,
      description: def.description || "",
      inputSchema: def.inputSchema || { type: "object", properties: {} },
      execute: def.execute,
    });
    if (opts && opts.signal) {
      opts.signal.addEventListener("abort", () => registry.delete(def.name), { once: true });
    }
    console.log("[webmcp-shim] registered:", def.name);
  }

  const shimMc = {
    registerTool(def, opts) {
      record(def, opts);
      // Keep a distinct native registry populated too (for any native agent).
      if (nativeNav && nativeNav !== shimMc && typeof nativeNav.registerTool === "function") {
        try {
          nativeNav.registerTool(def, opts);
        } catch (_) {}
      }
      return { unregister: () => registry.delete(def.name) };
    },
    async getTools() {
      return [...registry.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
    },
    async executeTool(name, args) {
      const tool = registry.get(name);
      if (!tool) throw new Error("unknown tool: " + name);
      const parsed = typeof args === "string" ? JSON.parse(args || "{}") : args || {};
      return toMcpResult(await tool.execute(parsed));
    },
  };

  function install(target) {
    if (!target) return false;
    try {
      Object.defineProperty(target, "modelContext", {
        value: shimMc,
        configurable: true,
        enumerable: false,
        writable: false,
      });
      return target.modelContext === shimMc;
    } catch (_) {
      return false;
    }
  }

  const navTakeover = install(nav);
  const docTakeover = install(doc);

  // Couldn't take over navigator (immovable native): wrap its registerTool so the
  // app's registrations still mirror into our registry.
  if (!navTakeover && nativeNav && typeof nativeNav.registerTool === "function") {
    const orig = nativeNav.registerTool.bind(nativeNav);
    const wrapped = function (def, opts) {
      try {
        record(def, opts);
      } catch (e) {
        console.warn("[webmcp-shim] record failed:", e);
      }
      try {
        return orig(def, opts);
      } catch (_) {}
    };
    try {
      nativeNav.registerTool = wrapped;
    } catch (_) {
      try {
        Object.defineProperty(nativeNav, "registerTool", {
          value: wrapped,
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.error("[webmcp-shim] could not wrap native registerTool — tools may be invisible:", e);
      }
    }
  }

  console.log(
    `[webmcp-shim] ready (navTakeover=${navTakeover}, docTakeover=${docTakeover}, wrappedNative=${!navTakeover && !!nativeNav}).`
  );
})();
