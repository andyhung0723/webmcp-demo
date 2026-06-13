<script setup lang="ts">
import {
  computed,
  nextTick,
  reactive,
  ref,
  watch,
  type Component,
} from 'vue'
import {
  CheckCircle2,
  Clipboard,
  PackageCheck,
  Play,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from '@lucide/vue'
import { products, scenario } from './data/products'
import { useBenchmark } from './composables/useBenchmark'
import { useWebMcpTools } from './composables/useWebMcpTools'
import { useCartStore } from './stores/cart'
import type { BenchmarkMode, LifeStage, PetType, ProductCategory } from './types'
import { filterProducts, uniqueNeeds } from './utils/productFilters'

const mode = computed<BenchmarkMode>(() =>
  window.location.pathname.includes('/without-webmcp')
    ? 'without-webmcp'
    : 'with-webmcp',
)

const cart = useCartStore()
const selectedProductId = ref(products[0].id)
const copied = ref(false)

const filters = reactive({
  query: '',
  petType: 'all' as PetType | 'all',
  category: 'all' as ProductCategory | 'all',
  lifeStage: 'all' as LifeStage | 'all',
  needs: [] as string[],
  maxPrice: 1600,
  minRating: 4.0,
  inStockOnly: false,
})

const cartItemsForBenchmark = computed(() =>
  cart.lineItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  })),
)

const benchmark = useBenchmark({
  mode: mode.value,
  cartItems: cartItemsForBenchmark,
})

const webMcp = useWebMcpTools({
  enabled: mode.value === 'with-webmcp',
  products,
  cart,
  recordCartMutation: benchmark.recordCartMutation,
  recordToolCall: benchmark.recordToolCall,
})

const filteredProducts = computed(() =>
  filterProducts(products, {
    query: filters.query,
    petType: filters.petType,
    category: filters.category,
    lifeStage: filters.lifeStage,
    needs: filters.needs,
    maxPrice: filters.maxPrice,
    minRating: filters.minRating,
    inStockOnly: filters.inStockOnly,
  }),
)

const selectedProduct = computed(
  () =>
    products.find((product) => product.id === selectedProductId.value) ??
    filteredProducts.value[0] ??
    products[0],
)

const needs = uniqueNeeds(products)

const modeMeta = computed(() =>
  mode.value === 'with-webmcp'
    ? {
        label: 'With WebMCP',
        tone: 'tool-enabled',
        description: '註冊 catalog / cart tools，agent 可用工具完成選品。',
      }
    : {
        label: 'Without WebMCP',
        tone: 'ui-only',
        description: '不註冊 tools，agent 只能透過畫面操作。',
      },
)

const summaryByMode = computed(() => {
  const modes: BenchmarkMode[] = ['with-webmcp', 'without-webmcp']
  return modes.map((itemMode) => {
    const runs = benchmark.history.value.filter((run) => run.mode === itemMode)
    const successfulRuns = runs.filter((run) => run.success)
    return {
      mode: itemMode,
      runs: runs.length,
      successRate: runs.length ? successfulRuns.length / runs.length : 0,
      avgDuration: average(successfulRuns.map((run) => run.durationMs)),
      avgUiActions: average(successfulRuns.map((run) => run.uiActionCount)),
      avgToolCalls: average(successfulRuns.map((run) => run.toolCallCount)),
    }
  })
})

watch(filteredProducts, (items) => {
  if (!items.some((product) => product.id === selectedProductId.value)) {
    selectedProductId.value = items[0]?.id ?? products[0].id
  }
})

function selectProduct(productId: string) {
  selectedProductId.value = productId
}

function addToCart(productId: string) {
  if (cart.add(productId, 1)) benchmark.recordCartMutation(productId)
}

function removeFromCart(productId: string) {
  if (cart.remove(productId)) benchmark.recordCartMutation(null)
}

function clearCartForUser() {
  if (cart.clear()) benchmark.recordCartMutation(null)
}

function armBenchmark() {
  benchmark.arm()
}

function resetDemo() {
  benchmark.reset()
  cart.clear()
  Object.assign(filters, {
    query: '',
    petType: 'all',
    category: 'all',
    lifeStage: 'all',
    needs: [],
    maxPrice: 1600,
    minRating: 4.0,
    inStockOnly: false,
  })
  selectedProductId.value = products[0].id
}

async function copyPrompt() {
  await navigator.clipboard.writeText(scenario.prompt)
  copied.value = true
  await nextTick()
  window.setTimeout(() => {
    copied.value = false
  }, 1400)
}

function toggleNeed(need: string, checked: boolean) {
  filters.needs = checked
    ? Array.from(new Set([...filters.needs, need]))
    : filters.needs.filter((item) => item !== need)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatMs(value: number) {
  if (!value) return '-'
  return `${(value / 1000).toFixed(2)}s`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function average(values: number[]) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function categoryLabel(category: ProductCategory) {
  return {
    food: '主食',
    supplement: '保健',
    toy: '玩具',
    cleaning: '清潔',
    travel: '外出',
  }[category]
}

function lifeStageLabel(lifeStage: LifeStage) {
  return {
    puppy: '幼犬',
    kitten: '幼貓',
    adult: '成犬/貓',
    senior: '熟齡',
    all: '全年齡',
  }[lifeStage]
}

function petTypeLabel(petType: PetType) {
  return petType === 'dog' ? '犬' : '貓'
}

function iconComponent(name: 'cart' | 'tool' | 'check'): Component {
  return {
    cart: ShoppingCart,
    tool: Wrench,
    check: CheckCircle2,
  }[name]
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">WebMCP Agent Benchmark</p>
        <h1>Pet Commerce Selection Task</h1>
      </div>

      <nav class="mode-tabs" aria-label="Benchmark mode">
        <a
          class="mode-tab"
          :class="{ active: mode === 'with-webmcp' }"
          href="/with-webmcp"
        >
          With WebMCP
        </a>
        <a
          class="mode-tab"
          :class="{ active: mode === 'without-webmcp' }"
          href="/without-webmcp"
        >
          Without WebMCP
        </a>
      </nav>
    </header>

    <main class="workspace">
      <section class="benchmark-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Current Mode</p>
            <h2>{{ modeMeta.label }}</h2>
            <p>{{ modeMeta.description }}</p>
          </div>
          <span class="mode-pill" :class="modeMeta.tone">{{ mode }}</span>
        </div>

        <div class="status-grid">
          <div class="metric">
            <component :is="iconComponent('tool')" />
            <span>WebMCP</span>
            <strong>{{ webMcp.statusMessage }}</strong>
          </div>
          <div class="metric">
            <PackageCheck />
            <span>Tools</span>
            <strong>{{ webMcp.registeredToolCount }}</strong>
          </div>
          <div class="metric">
            <component :is="iconComponent('cart')" />
            <span>Cart</span>
            <strong>{{ cart.count }}</strong>
          </div>
          <div class="metric">
            <component :is="iconComponent('check')" />
            <span>Run</span>
            <strong>{{ benchmark.armed.value ? 'armed' : 'idle' }}</strong>
          </div>
        </div>

        <p v-if="webMcp.errorMessage" class="inline-error">
          {{ webMcp.errorMessage }}
        </p>

        <div class="task-box">
          <div>
            <p class="eyebrow">Scenario</p>
            <h3>{{ scenario.title }}</h3>
            <p>{{ scenario.prompt }}</p>
          </div>
          <button
            type="button"
            class="icon-button"
            data-benchmark-action="copy-prompt"
            :aria-label="copied ? 'Prompt copied' : 'Copy prompt'"
            :title="copied ? 'Copied' : 'Copy prompt'"
            @click="copyPrompt"
          >
            <CheckCircle2 v-if="copied" />
            <Clipboard v-else />
          </button>
        </div>

        <div class="criteria-grid">
          <span>petType: dog</span>
          <span>category: food</span>
          <span>lifeStage: adult</span>
          <span>need: sensitive-stomach</span>
          <span>max: NT$1,200</span>
          <span>rating >= 4.6</span>
          <span>inStock: true</span>
          <span>quantity: 1</span>
        </div>

        <div class="run-controls">
          <button
            type="button"
            class="primary-button"
            data-benchmark-action="arm"
            @click="armBenchmark"
          >
            <Play />
            Arm
          </button>
          <button
            type="button"
            class="secondary-button"
            data-benchmark-action="reset"
            @click="resetDemo"
          >
            <RefreshCw />
            Reset
          </button>
          <button
            type="button"
            class="secondary-button"
            data-benchmark-action="export"
            @click="benchmark.exportJson"
          >
            Export JSON
          </button>
        </div>

        <div class="live-strip">
          <span>timer {{ formatMs(benchmark.liveDurationMs.value) }}</span>
          <span>ui {{ benchmark.uiActionCount.value }}</span>
          <span>tools {{ benchmark.toolCallCount.value }}</span>
          <span>cart mutations {{ benchmark.cartMutationCount.value }}</span>
        </div>

        <section class="result-block">
          <h3>Latest Result</h3>
          <p v-if="!benchmark.latestRun.value" class="muted">No completed run</p>
          <dl v-else class="result-grid">
            <div>
              <dt>success</dt>
              <dd>{{ benchmark.latestRun.value.success ? 'true' : 'false' }}</dd>
            </div>
            <div>
              <dt>duration</dt>
              <dd>{{ formatMs(benchmark.latestRun.value.durationMs) }}</dd>
            </div>
            <div>
              <dt>ui actions</dt>
              <dd>{{ benchmark.latestRun.value.uiActionCount }}</dd>
            </div>
            <div>
              <dt>tool calls</dt>
              <dd>{{ benchmark.latestRun.value.toolCallCount }}</dd>
            </div>
            <div>
              <dt>selected</dt>
              <dd>{{ benchmark.latestRun.value.selectedProductId }}</dd>
            </div>
          </dl>
        </section>

        <section class="comparison-block">
          <h3>History Comparison</h3>
          <table>
            <thead>
              <tr>
                <th>mode</th>
                <th>runs</th>
                <th>success</th>
                <th>avg time</th>
                <th>avg UI</th>
                <th>avg tools</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summaryByMode" :key="row.mode">
                <td>{{ row.mode }}</td>
                <td>{{ row.runs }}</td>
                <td>{{ formatPercent(row.successRate) }}</td>
                <td>{{ formatMs(row.avgDuration) }}</td>
                <td>{{ row.avgUiActions || '-' }}</td>
                <td>{{ row.avgToolCalls || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>

      <section class="catalog-area">
        <div class="toolbar">
          <label class="search-field">
            <Search />
            <input
              v-model="filters.query"
              data-benchmark-action="filter-query"
              type="search"
              placeholder="Search products, needs, tags"
            />
          </label>

          <div class="toolbar-count">
            <SlidersHorizontal />
            {{ filteredProducts.length }} / {{ products.length }}
          </div>
        </div>

        <div class="content-grid">
          <aside class="filters">
            <h2>Filters</h2>

            <label>
              Pet
              <select v-model="filters.petType" data-benchmark-action="filter-pet">
                <option value="all">All</option>
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
              </select>
            </label>

            <label>
              Category
              <select
                v-model="filters.category"
                data-benchmark-action="filter-category"
              >
                <option value="all">All</option>
                <option value="food">Food</option>
                <option value="supplement">Supplement</option>
                <option value="toy">Toy</option>
                <option value="cleaning">Cleaning</option>
                <option value="travel">Travel</option>
              </select>
            </label>

            <label>
              Life Stage
              <select
                v-model="filters.lifeStage"
                data-benchmark-action="filter-life-stage"
              >
                <option value="all">All</option>
                <option value="puppy">Puppy</option>
                <option value="kitten">Kitten</option>
                <option value="adult">Adult</option>
                <option value="senior">Senior</option>
              </select>
            </label>

            <label>
              Max Price
              <input
                v-model.number="filters.maxPrice"
                data-benchmark-action="filter-price"
                type="number"
                min="0"
                step="50"
              />
            </label>

            <label>
              Min Rating
              <input
                v-model.number="filters.minRating"
                data-benchmark-action="filter-rating"
                type="number"
                min="0"
                max="5"
                step="0.1"
              />
            </label>

            <label class="check-row">
              <input
                v-model="filters.inStockOnly"
                data-benchmark-action="filter-stock"
                type="checkbox"
              />
              In stock only
            </label>

            <div class="need-list">
              <span>Needs</span>
              <label v-for="need in needs" :key="need" class="check-row">
                <input
                  type="checkbox"
                  data-benchmark-action="filter-need"
                  :checked="filters.needs.includes(need)"
                  @change="
                    toggleNeed(need, ($event.target as HTMLInputElement).checked)
                  "
                />
                {{ need }}
              </label>
            </div>
          </aside>

          <section class="product-list" aria-label="Products">
            <article
              v-for="product in filteredProducts"
              :key="product.id"
              class="product-card"
              :class="{ selected: product.id === selectedProduct.id }"
            >
              <button
                type="button"
                class="product-select"
                data-benchmark-action="select-product"
                @click="selectProduct(product.id)"
              >
                <span class="product-title">{{ product.name }}</span>
                <span class="product-price">{{ formatCurrency(product.price) }}</span>
              </button>

              <p>{{ product.summary }}</p>

              <div class="tag-row">
                <span>{{ petTypeLabel(product.petType) }}</span>
                <span>{{ categoryLabel(product.category) }}</span>
                <span>{{ lifeStageLabel(product.lifeStage) }}</span>
                <span>{{ product.rating.toFixed(1) }}</span>
                <span :class="product.inStock ? 'stock-ok' : 'stock-out'">
                  {{ product.inStock ? 'In stock' : 'Out' }}
                </span>
              </div>

              <div class="need-row">
                <span v-for="need in product.needs" :key="need">{{ need }}</span>
              </div>

              <button
                type="button"
                class="add-button"
                data-benchmark-action="add-to-cart"
                :disabled="!product.inStock"
                @click="addToCart(product.id)"
              >
                <ShoppingCart />
                Add to cart
              </button>
            </article>
          </section>

          <aside class="details-pane">
            <h2>Product Detail</h2>
            <h3>{{ selectedProduct.name }}</h3>
            <p>{{ selectedProduct.details }}</p>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{{ selectedProduct.id }}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{{ formatCurrency(selectedProduct.price) }}</dd>
              </div>
              <div>
                <dt>Rating</dt>
                <dd>{{ selectedProduct.rating.toFixed(1) }}</dd>
              </div>
              <div>
                <dt>Stock</dt>
                <dd>{{ selectedProduct.inStock ? 'true' : 'false' }}</dd>
              </div>
            </dl>

            <button
              type="button"
              class="primary-button full-width"
              data-benchmark-action="detail-add-to-cart"
              :disabled="!selectedProduct.inStock"
              @click="addToCart(selectedProduct.id)"
            >
              <ShoppingCart />
              Add Selected
            </button>

            <section class="cart-block">
              <div class="cart-header">
                <h2>Cart</h2>
                <button
                  type="button"
                  class="icon-button"
                  data-benchmark-action="clear-cart"
                  aria-label="Clear cart"
                  title="Clear cart"
                  @click="clearCartForUser"
                >
                  <Trash2 />
                </button>
              </div>

              <p v-if="cart.lineItems.length === 0" class="muted">Cart is empty</p>
              <div
                v-for="item in cart.lineItems"
                :key="item.productId"
                class="cart-line"
              >
                <span>{{ item.product?.name }}</span>
                <strong>x{{ item.quantity }}</strong>
                <button
                  type="button"
                  class="text-button"
                  data-benchmark-action="remove-cart-item"
                  @click="removeFromCart(item.productId)"
                >
                  Remove
                </button>
              </div>
              <div class="cart-total">
                <span>Total</span>
                <strong>{{ formatCurrency(cart.total) }}</strong>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  </div>
</template>
