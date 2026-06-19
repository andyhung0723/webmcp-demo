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

## 技術架構

- **Vue 3 + Pinia + Vite + TypeScript**
- `src/data/products.ts` — 20 個 benchmark 商品，純資料，永不修改視覺欄位
- `src/utils/productVisuals.ts` — `decorateProduct()` 衍生視覺欄位（icon、顏色、短名、標籤）
- `src/composables/useBenchmark.ts` — 計時、事件計數、localStorage 歷史、JSON 匯出
- `src/composables/useWebMcpTools.ts` — 工具註冊與 AbortController 生命週期管理
- `src/components/BenchmarkDrawer.vue` — 深藍右滑抽屜，顯示真實歷史對比與加速倍率
- `src/utils/productFilters.ts` — 多維篩選邏輯（也是 `search_pet_products` 的後端）

---

## 注意事項

- WebMCP Origin Trial 只在 Chrome 149+ 有效；其他瀏覽器 `navigator.modelContext` 為 undefined，頁面仍可正常瀏覽但工具無法註冊
- Claude in Chrome 目前**不原生支援** WebMCP（feature request [#30645](https://github.com/anthropics/claude-in-chrome/issues/30645)），所以 without-webmcp 測試才用它做 DOM agent baseline
- 歷史資料存在 `localStorage`，最多 50 筆，可從抽屜匯出 JSON
