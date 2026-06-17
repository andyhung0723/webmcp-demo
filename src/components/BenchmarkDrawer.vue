<script setup lang="ts">
import { computed } from 'vue'
import type { BenchmarkMode, BenchmarkRun, ToolCallLog } from '../types'

interface ModeSummary {
  mode: BenchmarkMode
  runs: number
  successRate: number
  avgDuration: number
  avgUiActions: number
  avgToolCalls: number
}

const props = defineProps<{
  open: boolean
  mode: BenchmarkMode
  scenarioTitle: string
  scenarioPrompt: string
  criteria: string[]
  webmcpStatus: string
  webmcpAvailable: boolean
  webmcpError: string
  toolCount: number
  armed: boolean
  liveMs: number
  uiActions: number
  toolCalls: number
  cartMutations: number
  toolLog: ToolCallLog[]
  latestRun: BenchmarkRun | null
  summary: ModeSummary[]
  copied: boolean
}>()

const emit = defineEmits<{
  close: []
  arm: []
  reset: []
  export: []
  copy: []
}>()

function fmtMs(value: number): string {
  if (!value) return '—'
  return `${(value / 1000).toFixed(2)}s`
}

const without = computed(() => props.summary.find((s) => s.mode === 'without-webmcp'))
const withMcp = computed(() => props.summary.find((s) => s.mode === 'with-webmcp'))

/** 兩種模式都有成功紀錄時，用真實平均耗時算加速倍率。 */
const speedup = computed(() => {
  const dom = without.value?.avgDuration ?? 0
  const mcp = withMcp.value?.avgDuration ?? 0
  if (!dom || !mcp) return null
  const ratio = dom / mcp
  return {
    ratioStr: `${ratio.toFixed(1)}×`,
    savedStr: `${((dom - mcp) / 1000).toFixed(1)} 秒`,
    domStr: fmtMs(dom),
    mcpStr: fmtMs(mcp),
    domPct: 100,
    mcpPct: Math.max(7, Math.round((mcp / dom) * 100)),
  }
})

const liveLabel = computed(() => (props.armed ? '量測進行中…' : '待命'))
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
            <div class="bd-sub">同一電商任務：傳統 DOM 操作 vs WebMCP 工具呼叫（真實量測）</div>
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
                <div class="bd-mode-desc">頁面公開結構化工具，Agent 直接呼叫</div>
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
          <div class="bd-step">② 任務情境</div>
          <div class="bd-task">
            <div class="bd-task-title">{{ scenarioTitle }}</div>
            <p class="bd-task-prompt">{{ scenarioPrompt }}</p>
            <button class="bd-copy" data-benchmark-action="copy-prompt" @click="emit('copy')">
              {{ copied ? '✓ 已複製' : '複製 prompt' }}
            </button>
            <div class="bd-criteria">
              <span v-for="c in criteria" :key="c">{{ c }}</span>
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
            <button class="bd-ghost" data-benchmark-action="export" @click="emit('export')">
              匯出 JSON
            </button>
          </div>

          <!-- 即時數據 -->
          <div class="bd-live">
            <div class="bd-live-head">
              <span class="bd-dot" :class="armed ? 'mcp' : 'dom'"></span>{{ liveLabel }}
            </div>
            <div class="bd-live-grid">
              <div><span>計時</span><strong>{{ fmtMs(liveMs) }}</strong></div>
              <div><span>UI 操作</span><strong>{{ uiActions }}</strong></div>
              <div><span>工具呼叫</span><strong>{{ toolCalls }}</strong></div>
              <div><span>購物車異動</span><strong>{{ cartMutations }}</strong></div>
            </div>
            <div v-if="toolLog.length" class="bd-log">
              <div v-for="entry in toolLog" :key="entry.id" class="bd-log-row" :class="entry.status">
                <span class="bd-log-dur">{{ entry.durationMs != null ? '+' + entry.durationMs + 'ms' : '…' }}</span>
                <span class="bd-log-name">{{ entry.name }}</span>
                <span class="bd-log-state">{{ entry.status }}</span>
              </div>
            </div>
          </div>

          <!-- 最新結果 -->
          <div v-if="latestRun" class="bd-latest">
            <div class="bd-latest-head">最近一次完成</div>
            <div class="bd-latest-grid">
              <div><span>模式</span><strong>{{ latestRun.mode }}</strong></div>
              <div><span>成功</span><strong :class="latestRun.success ? 'ok' : 'warn'">{{ latestRun.success ? 'true' : 'false' }}</strong></div>
              <div><span>耗時</span><strong>{{ fmtMs(latestRun.durationMs) }}</strong></div>
              <div><span>UI 操作</span><strong>{{ latestRun.uiActionCount }}</strong></div>
              <div><span>工具呼叫</span><strong>{{ latestRun.toolCallCount }}</strong></div>
            </div>
          </div>

          <!-- 兩模式真實對比 -->
          <div class="bd-step">④ 歷史對比（依模式平均）</div>
          <div class="bd-compare">
            <div class="bd-col dom">
              <div class="bd-col-head"><span class="bd-dot dom"></span>傳統模式</div>
              <div class="bd-col-big">{{ fmtMs(without?.avgDuration ?? 0) }}</div>
              <div class="bd-col-meta">
                {{ without?.runs ?? 0 }} 次・成功率 {{ Math.round((without?.successRate ?? 0) * 100) }}%
              </div>
              <div class="bd-col-meta">平均 UI {{ without?.avgUiActions || '—' }}・工具 {{ without?.avgToolCalls || '—' }}</div>
            </div>
            <div class="bd-col mcp">
              <span class="bd-tag">WebMCP</span>
              <div class="bd-col-head"><span class="bd-dot mcp"></span>WebMCP 模式</div>
              <div class="bd-col-big">{{ fmtMs(withMcp?.avgDuration ?? 0) }}</div>
              <div class="bd-col-meta">
                {{ withMcp?.runs ?? 0 }} 次・成功率 {{ Math.round((withMcp?.successRate ?? 0) * 100) }}%
              </div>
              <div class="bd-col-meta">平均 UI {{ withMcp?.avgUiActions || '—' }}・工具 {{ withMcp?.avgToolCalls || '—' }}</div>
            </div>
          </div>

          <div v-if="speedup" class="bd-result">
            <div class="bd-result-head">
              <div class="bd-result-icon">⚡</div>
              <div>
                <div class="bd-result-label">WebMCP 完成同樣任務</div>
                <div class="bd-result-big">快 <span>{{ speedup.ratioStr }}</span>・省下 {{ speedup.savedStr }}</div>
              </div>
            </div>
            <div class="bd-bars">
              <div>
                <div class="bd-bar-label"><span>傳統 DOM 操作</span><span>{{ speedup.domStr }}</span></div>
                <div class="bd-bar"><div class="bd-bar-fill dom" :style="{ width: speedup.domPct + '%' }"></div></div>
              </div>
              <div>
                <div class="bd-bar-label"><span>WebMCP 工具呼叫</span><span>{{ speedup.mcpStr }}</span></div>
                <div class="bd-bar"><div class="bd-bar-fill mcp" :style="{ width: speedup.mcpPct + '%' }"></div></div>
              </div>
            </div>
          </div>
          <p v-else class="bd-hint">
            兩種模式各跑一次（切換 ① 的模式、按「開始量測」、再用畫面或 Agent 完成任務），即可看到真實加速對比。
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
  background: rgba(27, 20, 15, 0.45);
  backdrop-filter: blur(2px);
}
.bd-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 780px;
  max-width: 96vw;
  background: #0f1a30;
  color: #e6ecf7;
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.4);
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
  border-bottom: 1px solid #233455;
  display: flex;
  align-items: center;
  gap: 14px;
}
.bd-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #5b8def, #3ac0a0);
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
  color: #fff;
  font-family: 'Baloo 2', sans-serif;
}
.bd-sub {
  font-size: 12.5px;
  color: #8fa3c8;
}
.bd-close {
  background: #233455;
  border: none;
  color: #b9c7e3;
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
  font-size: 12.5px;
  font-weight: 700;
  color: #8fa3c8;
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
  border: 2px solid #2a3c5e;
  background: #15243f;
  color: #8fa3c8;
  text-decoration: none;
  overflow: hidden;
}
.bd-mode.active {
  border-color: #5b8def;
  background: #1a2b4d;
  color: #cfe0ff;
}
.bd-mode.mcp.active {
  border-color: #3ac0a0;
  background: #0f2a2a;
  color: #c7f0e5;
}
.bd-mode-name {
  font-size: 13.5px;
  font-weight: 800;
  color: #fff;
}
.bd-mode-desc {
  font-size: 11px;
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
  background: #7e8da8;
}
.bd-dot.mcp {
  background: #3ac0a0;
}
.bd-tag {
  position: absolute;
  top: 0;
  right: 0;
  background: #3ac0a0;
  color: #06231e;
  font-size: 10px;
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
  background: #15243f;
  border: 1px solid #2a3c5e;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bd-stat span {
  font-size: 11px;
  color: #7689ac;
}
.bd-stat strong {
  font-size: 14px;
  color: #fff;
  font-family: 'Baloo 2', sans-serif;
}
.ok {
  color: #3ac0a0 !important;
}
.warn {
  color: #f0a35b !important;
}
.bd-error {
  margin-top: 10px;
  font-size: 12px;
  color: #f0a35b;
  background: #2a1f1a;
  border-radius: 10px;
  padding: 10px 12px;
}

.bd-task {
  background: #15243f;
  border: 1px solid #2a3c5e;
  border-radius: 14px;
  padding: 16px 18px;
}
.bd-task-title {
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 6px;
}
.bd-task-prompt {
  font-size: 13px;
  line-height: 1.7;
  color: #aebcd6;
  margin: 0 0 12px;
}
.bd-copy {
  background: #233455;
  border: none;
  color: #cfe0ff;
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.bd-criteria {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}
.bd-criteria span {
  font-size: 11.5px;
  font-family: 'Baloo 2', monospace;
  color: #9fe3d3;
  background: #0f2a2a;
  border: 1px solid #1f5a50;
  border-radius: 8px;
  padding: 4px 9px;
}

.bd-controls {
  display: flex;
  gap: 10px;
}
.bd-run {
  flex: 1;
  background: linear-gradient(135deg, #5b8def, #3ac0a0);
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
  background: #15243f;
  border: 1px solid #2a3c5e;
  color: #b9c7e3;
  border-radius: 14px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.bd-live {
  margin-top: 16px;
  background: #15243f;
  border: 1px solid #2a3c5e;
  border-radius: 16px;
  padding: 16px 18px;
}
.bd-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
  color: #c8d3e8;
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
  font-size: 11px;
  color: #7689ac;
}
.bd-live-grid strong {
  font-size: 20px;
  color: #fff;
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
  font-size: 11.5px;
  font-family: 'Baloo 2', monospace;
  align-items: center;
}
.bd-log-dur {
  color: #5c6e92;
  flex: none;
  min-width: 56px;
}
.bd-log-name {
  color: #bdefe2;
  flex: 1;
}
.bd-log-state {
  color: #7689ac;
}
.bd-log-row.success .bd-log-state {
  color: #3ac0a0;
}
.bd-log-row.error .bd-log-state {
  color: #f0a35b;
}

.bd-latest {
  margin-top: 16px;
  background: #15243f;
  border: 1px solid #2a3c5e;
  border-radius: 16px;
  padding: 16px 18px;
}
.bd-latest-head {
  font-size: 13px;
  font-weight: 800;
  color: #c8d3e8;
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
  font-size: 10.5px;
  color: #7689ac;
}
.bd-latest-grid strong {
  font-size: 14px;
  color: #fff;
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
  background: #15243f;
  border: 1px solid #2a3c5e;
}
.bd-col.mcp {
  background: #0f2a2a;
  border: 1px solid #1f5a50;
}
.bd-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 800;
  color: #c8d3e8;
  margin-bottom: 10px;
}
.bd-col-big {
  font-size: 34px;
  font-weight: 800;
  color: #fff;
  font-family: 'Baloo 2', sans-serif;
  line-height: 1;
  margin-bottom: 8px;
}
.bd-col-meta {
  font-size: 11.5px;
  color: #7689ac;
  line-height: 1.6;
}
.bd-col.mcp .bd-col-meta {
  color: #6fb3a4;
}

.bd-result {
  margin-top: 18px;
  background: linear-gradient(135deg, #13352f, #15243f);
  border: 1px solid #2c6b5e;
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
  font-size: 13px;
  color: #8fa3c8;
  margin-bottom: 2px;
}
.bd-result-big {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  font-family: 'Baloo 2', sans-serif;
}
.bd-result-big span {
  color: #3ac0a0;
}
.bd-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bd-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #a6b4d0;
  margin-bottom: 5px;
}
.bd-bar {
  height: 14px;
  background: #0f1a30;
  border-radius: 999px;
  overflow: hidden;
}
.bd-bar-fill {
  height: 100%;
  border-radius: 999px;
}
.bd-bar-fill.dom {
  background: #7e8da8;
}
.bd-bar-fill.mcp {
  background: linear-gradient(90deg, #3ac0a0, #5b8def);
  min-width: 8px;
}
.bd-hint {
  margin-top: 16px;
  text-align: center;
  padding: 16px;
  color: #5c6e92;
  font-size: 12.5px;
  line-height: 1.7;
}
</style>
