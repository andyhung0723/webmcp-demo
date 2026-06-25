# WebMCP Demo — 毛日子 FURDAYS

瀏覽器 AI Agent 效率基準測試：比較有無 [WebMCP (`navigator.modelContext`)](https://github.com/model-context-protocol/model-context-protocol) 時，完成同一購物任務需要多少時間與操作次數。

**Live demo**: https://andyhung0723.github.io/webmcp-demo

---

## 專案目的

WebMCP 是 W3C 草案標準（Chrome 149 Origin Trial），讓網頁透過 `navigator.modelContext.registerTool()` 向瀏覽器 AI Agent 暴露結構化工具。Agent 不需要爬 DOM、猜 UI 結構，直接呼叫工具完成任務。

這個 demo 用一個寵物電商情境量測：

| 指標 | Without WebMCP | With WebMCP |
|------|---------------|-------------|
| 完成方式 | Agent 操作 DOM（點擊、篩選、搜尋）| Agent 呼叫工具 API |
| 計時 | 第一個 DOM 動作 → 購物車命中 | 第一個工具呼叫 → 購物車命中 |
| 計數 | `data-benchmark-action` 事件數 | Tool call 次數 |

---

## Benchmark 情境

> **任務**：幫我找一包腸胃敏感成犬適合的主食，加入購物車

正解商品：`dog-gentle-digest-adult-kibble`（成犬、主食、腸胃敏感、NT$1,100、評分 4.8、有庫存）

> Prompt 與目標商品可從抽屜的 ✏️ 編輯按鈕自訂，預設值即為上述情境。

**干擾設計**：20 個商品，每個其他商品都恰好差一個條件（不同動物、不同生命階段、不同分類、缺貨、評分過低、價格過高、需求標籤不符），確保 Agent 必須多維度篩選才能找到正解。

---

## 已註冊的 WebMCP 工具

| 工具名稱 | 說明 |
|---------|------|
| `search_pet_products` | 多維過濾搜尋（petType, category, lifeStage, needs, maxPrice, minRating, inStockOnly） |
| `get_pet_product_details` | 取得單一商品完整資料 |
| `add_pet_product_to_cart` | 將商品加入購物車（mutating） |
| `view_cart` | 查看購物車內容與總價 |

---

## 啟動

```bash
npm install
npm run dev
# → http://localhost:5173/webmcp-demo/
```

Build：

```bash
npm run build   # output: dist/
npm run preview # 預覽 build 結果
```

GitHub Pages 透過 GitHub Actions 在 push to `main` 時自動部署。

---

## 如何測試

### 前置準備

1. 使用 **Chrome 149+**（需支援 `navigator.modelContext` Origin Trial）
2. 在 `index.html` 中已嵌入 first-party Origin Trial token，直接開啟即可

### 模式切換

URL query param `?mode=` 控制工具是否註冊：

| URL | 行為 |
|-----|------|
| `?mode=with-webmcp`（預設）| 註冊 4 個 MCP 工具 |
| `?mode=without-webmcp` | 不註冊工具，Agent 只能操作 DOM |

點擊右下角 **🤖 Agent 效能對比** 按鈕開啟 Benchmark 抽屜，可以切換模式、啟動計時（ARM）、查看結果。抽屜內 ✏️ 編輯按鈕可自訂任務標題、Prompt、目標商品與數量。

---

### With WebMCP — 使用 Model Context Tool Inspector

1. 安裝 Chrome 擴充套件：[Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec)
2. 開啟 `?mode=with-webmcp`
3. 打開 Benchmark 抽屜 → 點 **ARM 開始計時**，關掉抽屜
4. 打開 Model Context Tool Inspector → 確認看到 4 個工具已註冊
5. 下指令給擴充套件（或直接呼叫工具）：

   ```
   我家柴犬剛換成犬糧一直軟便，獸醫說試試看單一蛋白來源的無穀成犬主食，要有現貨，預算 1100 以內，加一包看看。
   ```

6. 任務完成後（購物車出現正解商品），計時自動停止
7. 打開抽屜查看本次結果

---

### Without WebMCP — 使用 Claude in Chrome

1. 安裝 Chrome 擴充套件：[Claude in Chrome](https://chromewebstore.google.com/detail/claude-in-chrome)（需登入 Claude）
2. 開啟 `?mode=without-webmcp`
3. 打開 Benchmark 抽屜 → 點 **ARM 開始計時**，關掉抽屜
4. 開啟 Claude in Chrome 側邊欄，輸入相同指令：

   ```
   我家柴犬剛換成犬糧一直軟便，獸醫說試試看單一蛋白來源的無穀成犬主食，要有現貨，預算 1100 以內，加一包看看。
   ```

5. Agent 會操作頁面 DOM（使用篩選器、搜尋、點擊加入購物車）
6. 購物車命中後自動停止，打開抽屜查看結果

---

### 錄製狀態提示

ARM 後，右上角會出現紅色脈動 **REC** 徽章 + 已計時秒數，即使抽屜關閉也可見。任務完成後變為綠色 **✓ 完成**。

---

## 後端 Agent 整合（用後端 LLM 驅動 WebMCP）

預設測試（Tool Inspector / Claude in Chrome）都是「瀏覽器端 agent」消費工具。這一節是另一條路：**把 agent 與 API key 放在後端**，用 HTTP API 觸發，讓後端 LLM 直接驅動本頁註冊的 WebMCP 工具。後端實作就在本專案 `server/index.mjs`（純 API + WebSocket，前端仍由 Vite 服務）。

### 為什麼後端不能直接呼叫 WebMCP？

WebMCP 工具的 `execute` handler 跑在**瀏覽器頁面的 session**裡（帶登入狀態、操作真正的 Pinia store / DOM）。後端沒有那個 runtime，無法直接 `executeTool`。所以「後端支援 WebMCP」的本質是 **orchestration（編排）而非 execution**：後端決定呼叫哪個工具，實際執行被橋回瀏覽器。

### 架構

```
瀏覽器（本頁，provider + 薄 client）          後端（agent + API key）
  shim: document/navigator.modelContext
  app: registerTool ×4
  bridge.js ──register(tool schemas)──►  收下 tool defs（= LLM 的 tools）
            ◄──── ready / registered ────
  [使用者下任務] ──POST /api/run──────►  跑 Claude tool-use loop
  executeTool(本頁 session) ◄─tool_call(WS)─  LLM 決定呼叫某工具
            ──tool_result(WS)─────────►  回灌 LLM，直到收斂
                                          回傳最終答案
```

### 後端如何「支援 WebMCP」（重點）

後端不認識任何特定工具，只做四件事：

1. **接收工具契約**：瀏覽器經 WebSocket 上報 `getTools()` 結果（每個工具的 `name / description / inputSchema`）。後端把它當成這個 session 的可用工具集，**不寫死**。
2. **轉成 LLM 工具定義**：WebMCP 的 `inputSchema` 是 JSON Schema，跟 Anthropic `input_schema` 同源，一行 `.map()` 轉好——這是整合幾乎零黏合成本的關鍵。
   ```js
   const tools = sess.tools.map(t => ({
     name: t.name, description: t.description, input_schema: t.inputSchema,
   }))
   ```
3. **跑 tool-use 迴圈**：呼叫 Claude；當 `stop_reason === "tool_use"`，把每個 `tool_use` block 經 WebSocket 送回瀏覽器（`{type:"tool_call", name, input}`），等回 `tool_result`，包成 Anthropic tool_result 回灌 messages，直到模型不再要工具。
4. **橋接執行、不自己執行**：後端從不執行工具邏輯；只把呼叫送回瀏覽器，由本頁 `document.modelContext.executeTool()` 在使用者 session 跑（所以會真的動到購物車）。

> 沒有 API key 時，後端退化成 scripted 模式：仍走完整的 register → tool_call → executeTool → result 橋接（挑頁面第一個無必填參數的工具），用來驗證管線，不需 LLM。

### 前端要加什麼

整合只在前端加 3 樣東西（皆 **localhost-only**，部署到 github.io 自動 no-op，不影響原生 Origin Trial 路徑）：

| 檔案 | 作用 |
|------|------|
| `public/webmcp-shim.js` | 補上本專案缺的 **consumer 面**（`getTools`/`executeTool`）。單一共享 registry：能接管 `navigator/document.modelContext` 就接管；遇到原生 provider-only 且不可覆寫時，**wrap 原生 `registerTool` 把註冊鏡射進來**，避免 split-brain（App 註冊進原生、bridge 讀到空的 → 0 tools） |
| `public/webmcp-bridge.js` | WebSocket 連後端、上報工具、收 `tool_call` → `executeTool`、提供 shadow-DOM 浮動面板（任務輸入 + transcript）。不動任何 Vue component |
| `index.html` | `<head>` 載入 shim（須早於 App 註冊）、`</body>` 前載入 bridge |

> 為什麼要 shim：本 App 只 `registerTool`（provider 面），沒有 consumer 面；且原生 `navigator.modelContext`（flag/Origin Trial）是 provider-only。少了 shim，後端就無從列舉與呼叫工具。

### 啟動

```bash
npm install
cp .env.example .env          # 首次：填入 ANTHROPIC_API_KEY

# 兩個 terminal，同一專案：
npm run backend               # 後端 agent → http://localhost:5174
npm run dev                   # 前端     → http://localhost:5173/webmcp-demo/
```

> 沒填 key 也能跑：後端進 scripted 模式，仍走完整 bridge（呼叫第一個無必填參數的工具）驗證管線。

開頁面 → 右下浮動面板顯示 `connected · <session> · 4 tools` → 下任務（例：找適合幼貓、預算內、評分達標的商品並加入購物車）→ 看 Claude 逐步呼叫工具、購物車即時變動。

### 注意

- **跨域**：前端 `:5173`、後端 `:5174` 不同源；後端 `/api/run` 已開 CORS，WebSocket 跨域不受 CORS 限制。
- **API key 只在後端**（`.env`，已 gitignore），瀏覽器端無任何 key——這是相對「前端直連 LLM」更接近正式環境的點。正式環境應再把 `/api/run` 放到帶授權的閘道後，並把工具當公開 API 設防（authz 在 server，非 UI 事件）。
- shell 環境變數覆蓋 `.env`（`ANTHROPIC_API_KEY=... npm run backend` 仍有效）；`AGENT_MODEL`、`PORT` 同樣可由 `.env` 設定。

---

## 技術架構

- **Vue 3 + Pinia + Vite + TypeScript**
- `src/data/products.ts` — 20 個 benchmark 商品，純資料，永不修改視覺欄位
- `src/utils/productVisuals.ts` — `decorateProduct()` 衍生視覺欄位（icon、顏色、短名、標籤）
- `src/composables/useBenchmark.ts` — 計時、事件計數、localStorage 歷史、JSON 匯出
- `src/composables/useWebMcpTools.ts` — 工具註冊與 AbortController 生命週期管理
- `src/components/BenchmarkDrawer.vue` — 深藍右滑抽屜，顯示真實歷史對比與加速倍率
- `src/utils/productFilters.ts` — 多維篩選邏輯（也是 `search_pet_products` 的後端）
- `server/index.mjs` — 後端 agent（HTTP `/api/run` + WebSocket bridge + `.env`），見「後端 Agent 整合」
- `public/webmcp-shim.js` — consumer 面 polyfill 與原生共存（localhost-only）
- `public/webmcp-bridge.js` — 連後端的 WS bridge 與浮動面板（localhost-only）

---

## 注意事項

- WebMCP Origin Trial 只在 Chrome 149+ 有效；其他瀏覽器 `navigator.modelContext` 為 undefined，頁面仍可正常瀏覽但工具無法註冊
- Claude in Chrome 目前**不原生支援** WebMCP（feature request [#30645](https://github.com/anthropics/claude-in-chrome/issues/30645)），所以 without-webmcp 測試才用它做 DOM agent baseline
- 歷史資料存在 `localStorage`，最多 50 筆，可從抽屜匯出 JSON
