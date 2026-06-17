import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'
import type { BenchmarkMode, BenchmarkRun, CartItem, ScenarioConfig, ToolCallLog } from '../types'

const HISTORY_KEY = 'webmcp-pet-benchmark-runs'

interface UseBenchmarkOptions {
  mode: BenchmarkMode
  cartItems: Ref<CartItem[]>
  scenario: Ref<ScenarioConfig>
}

export function useBenchmark({ mode, cartItems, scenario }: UseBenchmarkOptions) {
  const armed = ref(false)
  const startedAt = ref<number | null>(null)
  const uiActionCount = ref(0)
  const toolCallCount = ref(0)
  const cartMutationCount = ref(0)
  const selectedProductId = ref<string | null>(null)
  const latestRun = ref<BenchmarkRun | null>(null)
  const toolCalls = ref<ToolCallLog[]>([])
  const history = ref<BenchmarkRun[]>(loadHistory())
  const runNonce = ref(0)

  const liveDurationMs = ref(0)
  let durationTimer = 0

  const isRunning = computed(() => armed.value && startedAt.value !== null)

  function arm() {
    reset(false)
    armed.value = true
  }

  function reset(clearHistory = false) {
    armed.value = false
    startedAt.value = null
    uiActionCount.value = 0
    toolCallCount.value = 0
    cartMutationCount.value = 0
    selectedProductId.value = null
    latestRun.value = null
    toolCalls.value = []
    liveDurationMs.value = 0
    window.clearInterval(durationTimer)
    runNonce.value += 1

    if (clearHistory) {
      history.value = []
      window.localStorage.removeItem(HISTORY_KEY)
    }
  }

  function startIfNeeded() {
    if (!armed.value || startedAt.value !== null) return

    startedAt.value = performance.now()
    const startedAtWallClock = Date.now()
    durationTimer = window.setInterval(() => {
      if (startedAt.value === null) return
      liveDurationMs.value = Math.round(performance.now() - startedAt.value)
    }, 100)

    ;(state as BenchmarkState).startedAtWallClock = startedAtWallClock
  }

  function recordUiAction() {
    if (!armed.value) return
    startIfNeeded()
    uiActionCount.value += 1
  }

  function recordCartMutation(productId?: string | null) {
    if (!armed.value) return
    startIfNeeded()
    cartMutationCount.value += 1
    selectedProductId.value = productId ?? selectedProductId.value
  }

  async function recordToolCall<T>(name: string, handler: () => Promise<T> | T) {
    if (armed.value) {
      startIfNeeded()
      toolCallCount.value += 1
    }

    const entry = reactive<ToolCallLog>({
      id: `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      status: 'running',
      startedAt: performance.now(),
    })
    toolCalls.value = [entry, ...toolCalls.value].slice(0, 12)

    try {
      const result = await handler()
      entry.status = 'success'
      entry.durationMs = Math.round(performance.now() - entry.startedAt)
      return result
    } catch (error) {
      entry.status = 'error'
      entry.durationMs = Math.round(performance.now() - entry.startedAt)
      entry.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  function complete(success: boolean) {
    if (!armed.value || startedAt.value === null) return

    const completedAtMs = performance.now()
    const startedAtWallClock =
      (state as BenchmarkState).startedAtWallClock ?? Date.now()
    const run: BenchmarkRun = {
      id: `${mode}-${Date.now()}`,
      mode,
      scenarioId: scenario.value.expectedProductId,
      durationMs: Math.round(completedAtMs - startedAt.value),
      uiActionCount: uiActionCount.value,
      toolCallCount: toolCallCount.value,
      cartMutationCount: cartMutationCount.value,
      selectedProductId: selectedProductId.value,
      success,
      startedAt: new Date(startedAtWallClock).toISOString(),
      completedAt: new Date().toISOString(),
    }

    latestRun.value = run
    history.value = [run, ...history.value].slice(0, 50)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
    armed.value = false
    startedAt.value = null
    window.clearInterval(durationTimer)
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(history.value, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `webmcp-pet-benchmark-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function onBenchmarkEvent(event: Event) {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[data-benchmark-action]')) recordUiAction()
  }

  document.addEventListener('click', onBenchmarkEvent, true)
  document.addEventListener('input', onBenchmarkEvent, true)
  document.addEventListener('change', onBenchmarkEvent, true)
  document.addEventListener('submit', onBenchmarkEvent, true)

  watch(
    cartItems,
    (items) => {
      if (!armed.value || startedAt.value === null) return
      const { expectedProductId, expectedQuantity } = scenario.value
      const qty = items.find((item) => item.productId === expectedProductId)?.quantity ?? 0
      if (qty === expectedQuantity) complete(true)
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    document.removeEventListener('click', onBenchmarkEvent, true)
    document.removeEventListener('input', onBenchmarkEvent, true)
    document.removeEventListener('change', onBenchmarkEvent, true)
    document.removeEventListener('submit', onBenchmarkEvent, true)
    window.clearInterval(durationTimer)
  })

  const state = {
    armed,
    isRunning,
    liveDurationMs,
    latestRun,
    history,
    toolCalls,
    uiActionCount,
    toolCallCount,
    cartMutationCount,
    selectedProductId,
    runNonce,
    arm,
    reset,
    complete,
    exportJson,
    recordUiAction,
    recordCartMutation,
    recordToolCall,
  }

  return state
}

interface BenchmarkState {
  startedAtWallClock?: number
}

function loadHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as BenchmarkRun[]) : []
  } catch {
    return []
  }
}
