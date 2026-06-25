<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BenchmarkMode, BenchmarkRun, Product, ScenarioConfig, ToolCallLog } from '../types';

interface ModeSummary {
  mode: BenchmarkMode;
  runs: number;
  successRate: number;
  avgDuration: number;
  avgUiActions: number;
  avgToolCalls: number;
}

const props = defineProps<{
  open: boolean;
  mode: BenchmarkMode;
  scenarioConfig: ScenarioConfig;
  products: Product[];
  webmcpStatus: string;
  webmcpAvailable: boolean;
  webmcpError: string;
  toolCount: number;
  armed: boolean;
  liveMs: number;
  uiActions: number;
  toolCalls: number;
  cartMutations: number;
  toolLog: ToolCallLog[];
  latestRun: BenchmarkRun | null;
  summary: ModeSummary[];
  copied: boolean;
}>();

const emit = defineEmits<{
  close: [];
  arm: [];
  reset: [];
  copy: [];
  'update:scenarioConfig': [config: ScenarioConfig];
}>();

// 後端 Agent 模式需要本機後端（server/index.mjs），只在 localhost 提供切換
const isLocal = computed(() => {
  const h = location.hostname
  return h === 'localhost' || h === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
})

// ---- scenario editing ----
const editing = ref(false)
const draft = ref<ScenarioConfig>({ ...props.scenarioConfig })

watch(() => props.scenarioConfig, (v) => {
  if (!editing.value) draft.value = { ...v }
})

function startEdit() {
  draft.value = { ...props.scenarioConfig }
  editing.value = true
}

function saveEdit() {
  emit('update:scenarioConfig', { ...draft.value })
  editing.value = false
}

function cancelEdit() {
  editing.value = false
}

function fmtMs(value: number): string {
  if (!value) return '—';
  return `${(value / 1000).toFixed(2)}s`;
}

const without = computed(() => props.summary.find((s) => s.mode === 'without-webmcp'))
const withMcp = computed(() => props.summary.find((s) => s.mode === 'with-webmcp'))
const targetProduct = computed(() => props.products.find((p) => p.id === props.scenarioConfig.expectedProductId))

/** 兩種模式都有成功紀錄時，用真實平均耗時算加速倍率。 */
const speedup = computed(() => {
  const dom = without.value?.avgDuration ?? 0;
  const mcp = withMcp.value?.avgDuration ?? 0;
  if (!dom || !mcp) return null;
  const ratio = dom / mcp;
  return {
    ratioStr: `${ratio.toFixed(1)}×`,
    savedStr: `${((dom - mcp) / 1000).toFixed(1)} 秒`,
    domStr: fmtMs(dom),
    mcpStr: fmtMs(mcp),
    domPct: 100,
    mcpPct: Math.max(7, Math.round((mcp / dom) * 100)),
  };
});

const liveLabel = computed(() => (props.armed ? '量測進行中…' : '待命'));
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="bd-root">
      <div class="bd-scrim" @click="emit('close')"></div>

      <div class="bd-panel" role="dialog" aria-label="Agent 效能對比">
        <header class="bd-head">
          <div class="bd-logo">🤖</div>
          <div class="bd-head-text">
            <div class="bd-title">Browser Agent 效能對比</div>
            <div class="bd-sub">同一電商任務：傳統 DOM 操作 vs WebMCP 工具呼叫</div>
          </div>
          <button class="bd-close" @click="emit('close')">✕</button>
        </header>

        <div class="bd-body">
          <!-- 模式切換 -->
          <div class="bd-step">① 選擇執行模式（切換會重新載入頁面）</div>
          <div class="bd-modes">
            <a
              class="bd-mode"
              :class="{ active: mode === 'without-webmcp' }"
              href="?mode=without-webmcp"
            >
              <span class="bd-dot dom"></span>
              <div>
                <div class="bd-mode-name">傳統模式</div>
                <div class="bd-mode-desc">不註冊工具，Agent 只能解析 DOM 操作畫面</div>
              </div>
            </a>
            <a
              class="bd-mode mcp"
              :class="{ active: mode === 'with-webmcp' }"
              href="?mode=with-webmcp"
            >
              <span class="bd-tag">WebMCP</span>
              <span class="bd-dot mcp"></span>
              <div>
                <div class="bd-mode-name">WebMCP 模式</div>
                <div class="bd-mode-desc">頁面公開結構化工具，瀏覽器 Agent 直接呼叫</div>
              </div>
            </a>
            <a
              v-if="isLocal"
              class="bd-mode mcp"
              :class="{ active: mode === 'backend' }"
              href="?mode=backend"
            >
              <span class="bd-tag">Backend</span>
              <span class="bd-dot mcp"></span>
              <div>
                <div class="bd-mode-name">後端 Agent 模式</div>
                <div class="bd-mode-desc">
                  伺服器端 LLM 經 WebSocket 轉接，呼叫本頁 WebMCP 工具（需 <code>npm run backend</code>）
                </div>
              </div>
            </a>
          </div>

          <!-- WebMCP 狀態 -->
          <div class="bd-status">
            <div class="bd-stat">
              <span>navigator.modelContext</span>
              <strong :class="webmcpAvailable ? 'ok' : 'warn'">
                {{ webmcpAvailable ? 'available' : 'unavailable' }}
              </strong>
            </div>
            <div class="bd-stat">
              <span>狀態</span><strong>{{ webmcpStatus }}</strong>
            </div>
            <div class="bd-stat">
              <span>已註冊工具</span><strong>{{ toolCount }}</strong>
            </div>
          </div>
          <p v-if="webmcpError" class="bd-error">{{ webmcpError }}</p>

          <!-- 任務情境 -->
          <div class="bd-step">
            ② 任務情境
            <button v-if="!editing" class="bd-edit-btn" @click="startEdit">✏️ 編輯</button>
          </div>

          <!-- 檢視模式 -->
          <div v-if="!editing" class="bd-task">
            <div class="bd-task-title">{{ scenarioConfig.title }}</div>
            <p class="bd-task-prompt">{{ scenarioConfig.prompt }}</p>
            <div class="bd-task-target">
              目標商品：<strong>{{ targetProduct?.name ?? scenarioConfig.expectedProductId }}</strong>
              × {{ scenarioConfig.expectedQuantity }}
            </div>
            <button class="bd-copy" data-benchmark-action="copy-prompt" @click="emit('copy')">
              {{ copied ? '✓ 已複製' : '複製 prompt' }}
            </button>
          </div>

          <!-- 編輯模式 -->
          <div v-else class="bd-edit">
            <div class="bd-edit-field">
              <label>任務標題</label>
              <input v-model="draft.title" class="bd-input" type="text" />
            </div>
            <div class="bd-edit-field">
              <label>Agent Prompt</label>
              <textarea v-model="draft.prompt" class="bd-textarea" rows="4"></textarea>
            </div>
            <div class="bd-edit-row">
              <div class="bd-edit-field flex1">
                <label>目標商品</label>
                <select v-model="draft.expectedProductId" class="bd-select">
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div class="bd-edit-field w80">
                <label>數量</label>
                <input v-model.number="draft.expectedQuantity" class="bd-input" type="number" min="1" max="10" />
              </div>
            </div>
            <div class="bd-edit-actions">
              <button class="bd-run" @click="saveEdit">儲存</button>
              <button class="bd-ghost" @click="cancelEdit">取消</button>
            </div>
          </div>

          <!-- 控制 -->
          <div class="bd-step">③ 開始量測</div>
          <div class="bd-controls">
            <button class="bd-run" data-benchmark-action="arm" @click="emit('arm')">
              ▶ {{ armed ? '已待命，等待操作' : '開始量測' }}
            </button>
            <button class="bd-ghost" data-benchmark-action="reset" @click="emit('reset')">
              重設
            </button>
          </div>

          <!-- 即時數據 -->
          <div class="bd-live">
            <div class="bd-live-head">
              <span class="bd-dot" :class="armed ? 'mcp' : 'dom'"></span>{{ liveLabel }}
            </div>
            <div class="bd-live-grid">
              <div>
                <span>計時</span><strong>{{ fmtMs(liveMs) }}</strong>
              </div>
              <div>
                <span>DOM 操作</span><strong>{{ uiActions }}</strong>
              </div>
              <div>
                <span>工具呼叫</span><strong>{{ toolCalls }}</strong>
              </div>
              <div>
                <span>購物車異動</span><strong>{{ cartMutations }}</strong>
              </div>
            </div>
            <div v-if="toolLog.length" class="bd-log">
              <div
                v-for="entry in toolLog"
                :key="entry.id"
                class="bd-log-row"
                :class="entry.status"
              >
                <span class="bd-log-dur">{{
                  entry.durationMs != null ? '+' + entry.durationMs + 'ms' : '…'
                }}</span>
                <span class="bd-log-name">{{ entry.name }}</span>
                <span class="bd-log-state">{{ entry.status }}</span>
              </div>
            </div>
          </div>

          <!-- 最新結果 -->
          <div v-if="latestRun" class="bd-latest">
            <div class="bd-latest-head">最近一次完成</div>
            <div class="bd-latest-grid">
              <div>
                <span>模式</span><strong>{{ latestRun.mode }}</strong>
              </div>
              <div>
                <span>成功</span
                ><strong :class="latestRun.success ? 'ok' : 'warn'">{{
                  latestRun.success ? 'true' : 'false'
                }}</strong>
              </div>
              <div>
                <span>耗時</span><strong>{{ fmtMs(latestRun.durationMs) }}</strong>
              </div>
              <div>
                <span>DOM 操作</span><strong>{{ latestRun.uiActionCount }}</strong>
              </div>
              <div>
                <span>工具呼叫</span><strong>{{ latestRun.toolCallCount }}</strong>
              </div>
            </div>
          </div>

          <!-- 兩模式真實對比 -->
          <div class="bd-step">④ 歷史對比（依模式平均）</div>
          <div class="bd-compare">
            <div class="bd-col dom">
              <div class="bd-col-head"><span class="bd-dot dom"></span>傳統模式</div>
              <div class="bd-col-big">{{ fmtMs(without?.avgDuration ?? 0) }}</div>
              <div class="bd-col-meta">
                {{ without?.runs ?? 0 }} 次・成功率
                {{ Math.round((without?.successRate ?? 0) * 100) }}%
              </div>
              <div class="bd-col-meta">
                平均 DOM 操作 {{ without?.avgUiActions || '—' }}・工具呼叫
                {{ without?.avgToolCalls || '—' }}
              </div>
            </div>
            <div class="bd-col mcp">
              <span class="bd-tag">WebMCP</span>
              <div class="bd-col-head"><span class="bd-dot mcp"></span>WebMCP 模式</div>
              <div class="bd-col-big">{{ fmtMs(withMcp?.avgDuration ?? 0) }}</div>
              <div class="bd-col-meta">
                {{ withMcp?.runs ?? 0 }} 次・成功率
                {{ Math.round((withMcp?.successRate ?? 0) * 100) }}%
              </div>
              <div class="bd-col-meta">
                平均 DOM 操作 {{ withMcp?.avgUiActions || '—' }}・工具呼叫
                {{ withMcp?.avgToolCalls || '—' }}
              </div>
            </div>
          </div>

          <div v-if="speedup" class="bd-result">
            <div class="bd-result-head">
              <div class="bd-result-icon">⚡</div>
              <div>
                <div class="bd-result-label">WebMCP 完成同樣任務</div>
                <div class="bd-result-big">
                  快 <span>{{ speedup.ratioStr }}</span
                  >・省下 {{ speedup.savedStr }}
                </div>
              </div>
            </div>
            <div class="bd-bars">
              <div>
                <div class="bd-bar-label">
                  <span>傳統 DOM 操作</span><span>{{ speedup.domStr }}</span>
                </div>
                <div class="bd-bar">
                  <div class="bd-bar-fill dom" :style="{ width: speedup.domPct + '%' }"></div>
                </div>
              </div>
              <div>
                <div class="bd-bar-label">
                  <span>WebMCP 工具呼叫</span><span>{{ speedup.mcpStr }}</span>
                </div>
                <div class="bd-bar">
                  <div class="bd-bar-fill mcp" :style="{ width: speedup.mcpPct + '%' }"></div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="bd-hint">
            兩種模式各跑一次（切換 ① 的模式、按「開始量測」、再用畫面或 Agent
            完成任務），即可看到真實加速對比。
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bd-root {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.bd-scrim {
  position: absolute;
  inset: 0;
  background: rgba(30, 40, 70, 0.25);
  backdrop-filter: blur(2px);
}
.bd-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 780px;
  max-width: 96vw;
  background: #ffffff;
  color: #1a2a4a;
  box-shadow: -12px 0 40px rgba(30, 40, 80, 0.12);
  display: flex;
  flex-direction: column;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-active .bd-panel,
.drawer-leave-active .bd-panel {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .bd-panel,
.drawer-leave-to .bd-panel {
  transform: translateX(40px);
}

.bd-head {
  padding: 22px 28px;
  border-bottom: 1px solid #dde3f0;
  display: flex;
  align-items: center;
  gap: 14px;
}
.bd-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b6fd4, #0fa87c);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
.bd-head-text {
  flex: 1;
}
.bd-title {
  font-size: 18px;
  font-weight: 800;
  color: #1a2a4a;
  font-family: 'Baloo 2', sans-serif;
}
.bd-sub {
  font-size: 14px;
  color: #6a7a9a;
}
.bd-close {
  background: #ebeef8;
  border: none;
  color: #4a5a7a;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 18px;
  cursor: pointer;
}

.bd-body {
  padding: 20px 28px 32px;
  overflow-y: auto;
  flex: 1;
}
.bd-step {
  font-size: 13.5px;
  font-weight: 700;
  color: #6a7a9a;
  margin: 18px 0 10px;
}
.bd-step:first-child {
  margin-top: 0;
}

.bd-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.bd-mode {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  border: 2px solid #dde3f0;
  background: #f5f7fc;
  color: #6a7a9a;
  text-decoration: none;
  overflow: hidden;
}
.bd-mode.active {
  border-color: #3b6fd4;
  background: #eef3ff;
  color: #1a2a4a;
}
.bd-mode.mcp.active {
  border-color: #0fa87c;
  background: #f0faf6;
  color: #1a2a4a;
}
.bd-mode-name {
  font-size: 15px;
  font-weight: 800;
  color: #1a2a4a;
}
.bd-mode-desc {
  font-size: 12.5px;
  line-height: 1.4;
  margin-top: 2px;
}
.bd-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.bd-dot.dom {
  background: #9aaac0;
}
.bd-dot.mcp {
  background: #0fa87c;
}
.bd-tag {
  position: absolute;
  top: 0;
  right: 0;
  background: #0fa87c;
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
  padding: 3px 10px;
  border-bottom-left-radius: 10px;
}

.bd-status {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 14px;
}
.bd-stat {
  background: #f5f7fc;
  border: 1px solid #dde3f0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bd-stat span {
  font-size: 12.5px;
  color: #6a7a9a;
}
.bd-stat strong {
  font-size: 15px;
  color: #1a2a4a;
  font-family: 'Baloo 2', sans-serif;
}
.ok {
  color: #0fa87c !important;
}
.warn {
  color: #c05a10 !important;
}
.bd-error {
  margin-top: 10px;
  font-size: 13.5px;
  color: #c05a10;
  background: #fff4ee;
  border-radius: 10px;
  padding: 10px 12px;
}

.bd-task {
  background: #f5f7fc;
  border: 1px solid #dde3f0;
  border-radius: 14px;
  padding: 16px 18px;
}
.bd-task-title {
  font-size: 16px;
  font-weight: 800;
  color: #1a2a4a;
  margin-bottom: 6px;
}
.bd-task-prompt {
  font-size: 14px;
  line-height: 1.7;
  color: #4a5a7a;
  margin: 0 0 12px;
}
.bd-copy {
  background: #ebeef8;
  border: none;
  color: #3b6fd4;
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
}

.bd-controls {
  display: flex;
  gap: 10px;
}
.bd-run {
  flex: 1;
  background: linear-gradient(135deg, #3b6fd4, #0fa87c);
  color: #fff;
  border: none;
  border-radius: 14px;
  padding: 14px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.bd-run:hover {
  opacity: 0.92;
}
.bd-ghost {
  background: #f5f7fc;
  border: 1px solid #dde3f0;
  color: #4a5a7a;
  border-radius: 14px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.bd-live {
  margin-top: 16px;
  background: #f5f7fc;
  border: 1px solid #dde3f0;
  border-radius: 16px;
  padding: 16px 18px;
}
.bd-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 800;
  color: #2c3e6a;
  margin-bottom: 12px;
}
.bd-live-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.bd-live-grid div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bd-live-grid span {
  font-size: 12.5px;
  color: #6a7a9a;
}
.bd-live-grid strong {
  font-size: 24px;
  color: #1a2a4a;
  font-family: 'Baloo 2', sans-serif;
}
.bd-log {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bd-log-row {
  display: flex;
  gap: 10px;
  font-size: 13px;
  font-family: 'Baloo 2', monospace;
  align-items: center;
}
.bd-log-dur {
  color: #8090b0;
  flex: none;
  min-width: 56px;
}
.bd-log-name {
  color: #0a7860;
  flex: 1;
}
.bd-log-state {
  color: #6a7a9a;
}
.bd-log-row.success .bd-log-state {
  color: #0fa87c;
}
.bd-log-row.error .bd-log-state {
  color: #c05a10;
}

.bd-latest {
  margin-top: 16px;
  background: #f5f7fc;
  border: 1px solid #dde3f0;
  border-radius: 16px;
  padding: 16px 18px;
}
.bd-latest-head {
  font-size: 14px;
  font-weight: 800;
  color: #2c3e6a;
  margin-bottom: 12px;
}
.bd-latest-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.bd-latest-grid div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bd-latest-grid span {
  font-size: 12px;
  color: #6a7a9a;
}
.bd-latest-grid strong {
  font-size: 15px;
  color: #1a2a4a;
}

.bd-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.bd-col {
  position: relative;
  border-radius: 16px;
  padding: 18px;
  overflow: hidden;
}
.bd-col.dom {
  background: #f5f7fc;
  border: 1px solid #dde3f0;
}
.bd-col.mcp {
  background: #f0faf6;
  border: 1px solid #b8e8d8;
}
.bd-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: #2c3e6a;
  margin-bottom: 10px;
}
.bd-col-big {
  font-size: 38px;
  font-weight: 800;
  color: #1a2a4a;
  font-family: 'Baloo 2', sans-serif;
  line-height: 1;
  margin-bottom: 8px;
}
.bd-col-meta {
  font-size: 13px;
  color: #6a7a9a;
  line-height: 1.6;
}
.bd-col.mcp .bd-col-meta {
  color: #0a8060;
}

.bd-result {
  margin-top: 18px;
  background: linear-gradient(135deg, #f0faf6, #f5f7fc);
  border: 1px solid #b8e8d8;
  border-radius: 16px;
  padding: 22px;
}
.bd-result-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}
.bd-result-icon {
  font-size: 40px;
}
.bd-result-label {
  font-size: 14px;
  color: #6a7a9a;
  margin-bottom: 2px;
}
.bd-result-big {
  font-size: 28px;
  font-weight: 800;
  color: #1a2a4a;
  font-family: 'Baloo 2', sans-serif;
}
.bd-result-big span {
  color: #0fa87c;
}
.bd-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bd-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 13.5px;
  color: #5a6a8a;
  margin-bottom: 5px;
}
.bd-bar {
  height: 14px;
  background: #e8edf5;
  border-radius: 999px;
  overflow: hidden;
}
.bd-bar-fill {
  height: 100%;
  border-radius: 999px;
}
.bd-bar-fill.dom {
  background: #9aaac0;
}
.bd-bar-fill.mcp {
  background: linear-gradient(90deg, #0fa87c, #3b6fd4);
  min-width: 8px;
}
.bd-hint {
  margin-top: 16px;
  text-align: center;
  padding: 16px;
  color: #8090b0;
  font-size: 14px;
  line-height: 1.7;
}

/* ---- scenario edit ---- */
.bd-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bd-edit-btn {
  background: none;
  border: 1px solid #dde3f0;
  border-radius: 8px;
  color: #3b6fd4;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  cursor: pointer;
}
.bd-task-target {
  font-size: 13px;
  color: #4a5a7a;
  margin: 6px 0 10px;
}
.bd-task-target strong {
  color: #1a2a4a;
}
.bd-edit {
  background: #f5f7fc;
  border: 1px solid #dde3f0;
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bd-edit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bd-edit-field label {
  font-size: 12px;
  font-weight: 700;
  color: #6a7a9a;
}
.bd-edit-row {
  display: flex;
  gap: 10px;
}
.flex1 { flex: 1; }
.w80 { width: 80px; }
.bd-input {
  background: #fff;
  border: 1px solid #dde3f0;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13.5px;
  color: #1a2a4a;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.bd-input:focus {
  border-color: #3b6fd4;
}
.bd-textarea {
  background: #fff;
  border: 1px solid #dde3f0;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13.5px;
  color: #1a2a4a;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  line-height: 1.6;
}
.bd-textarea:focus {
  border-color: #3b6fd4;
}
.bd-select {
  background: #fff;
  border: 1px solid #dde3f0;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13.5px;
  color: #1a2a4a;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.bd-select:focus {
  border-color: #3b6fd4;
}

.bd-edit-actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}
.bd-edit-actions .bd-run {
  padding: 10px 24px;
  font-size: 14px;
}
</style>
