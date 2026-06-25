<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { products, scenario } from './data/products'
import type { ScenarioConfig } from './types'
import { useBenchmark } from './composables/useBenchmark'
import { useWebMcpTools } from './composables/useWebMcpTools'
import { useCartStore } from './stores/cart'
import { filterProducts, uniqueNeeds } from './utils/productFilters'
import {
  decorateProduct,
  formatTwd,
  needLabel,
  CATEGORY_LABEL,
  LIFE_STAGE_LABEL,
} from './utils/productVisuals'
import ProductCard from './components/ProductCard.vue'
import BenchmarkDrawer from './components/BenchmarkDrawer.vue'
import type {
  BenchmarkMode,
  BenchmarkRun,
  LifeStage,
  PetType,
  ProductCategory,
} from './types'

const FREE_SHIP = 1200
const SHIPPING_FEE = 60
const PROMO = '全館滿 NT$1,200 免運 ・ 新會員首購享 9 折'

const mode = computed<BenchmarkMode>(() => {
  const m = new URLSearchParams(window.location.search).get('mode')
  if (m === 'without-webmcp') return 'without-webmcp'
  if (m === 'backend') return 'backend'
  return 'with-webmcp'
})

const cart = useCartStore()

type View = 'shop' | 'product' | 'cart'
const view = ref<View>('shop')
const selectedId = ref<string | null>(null)
const detailTab = ref<'intro' | 'ingredient' | 'feeding' | 'review'>('intro')
const detailQty = ref(1)

const drawerOpen = ref(false)
const copied = ref(false)
const toastMsg = ref('')
let toastTimer = 0

const searchInput = ref('')
const filters = reactive({
  query: '',
  petType: 'cat' as PetType | 'all',
  category: 'all' as ProductCategory | 'all',
  lifeStage: 'all' as LifeStage | 'all',
  needs: [] as string[],
  maxPrice: 2000,
  minRating: 4.0,
  inStockOnly: false,
  sort: 'recommend' as 'recommend' | 'priceAsc' | 'priceDesc' | 'rating',
})

const searchActive = computed(() => filters.query.trim().length > 0)

// ---- scenario config (editable from drawer) ----
const scenarioConfig = ref<ScenarioConfig>({
  title: scenario.title,
  prompt: scenario.prompt,
  expectedProductId: scenario.expectedProductId,
  expectedQuantity: scenario.expectedQuantity,
})

// ---- benchmark + WebMCP wiring (real measurement, unchanged contract) ----
const cartItemsForBenchmark = computed(() =>
  cart.lineItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  })),
)

const benchmark = useBenchmark({
  mode: mode.value,
  cartItems: cartItemsForBenchmark,
  scenario: scenarioConfig,
})

const webMcp = useWebMcpTools({
  // Tools are needed both for the browser-agent demo and the backend-bridge demo.
  enabled: mode.value !== 'without-webmcp',
  products,
  cart,
  recordCartMutation: benchmark.recordCartMutation,
  recordToolCall: benchmark.recordToolCall,
})

// ---- catalog ----
const filtered = computed(() => {
  const list = filterProducts(products, {
    query: filters.query,
    petType: filters.petType,
    category: filters.category,
    lifeStage: filters.lifeStage,
    needs: filters.needs,
    maxPrice: filters.maxPrice,
    minRating: filters.minRating,
    inStockOnly: filters.inStockOnly,
  })
  const sorted = [...list]
  if (filters.sort === 'priceAsc') sorted.sort((a, b) => a.price - b.price)
  else if (filters.sort === 'priceDesc') sorted.sort((a, b) => b.price - a.price)
  else if (filters.sort === 'rating') sorted.sort((a, b) => b.rating - a.rating)
  return sorted
})

const visibleProducts = computed(() => filtered.value.map(decorateProduct))

const selectedProduct = computed(() => {
  const product = products.find((item) => item.id === selectedId.value)
  return product ? decorateProduct(product) : null
})

const relatedProducts = computed(() => {
  const current = selectedProduct.value
  if (!current) return []
  return products
    .filter((p) => p.petType === current.petType && p.id !== current.id)
    .slice(0, 4)
    .map(decorateProduct)
})

const recommendProducts = computed(() =>
  products
    .filter((p) => p.inStock && !cart.items.has(p.id))
    .slice(0, 3)
    .map(decorateProduct),
)

const cartLines = computed(() =>
  cart.lineItems
    .filter((item) => item.product)
    .map((item) => ({
      id: item.productId,
      qty: item.quantity,
      product: decorateProduct(item.product!),
      lineTotal: (item.product?.price ?? 0) * item.quantity,
    })),
)

const subtotal = computed(() => cart.total)
const freeShip = computed(() => subtotal.value >= FREE_SHIP)
const shipping = computed(() =>
  subtotal.value === 0 || freeShip.value ? 0 : SHIPPING_FEE,
)
const remaining = computed(() => Math.max(0, FREE_SHIP - subtotal.value))
const shipPct = computed(() =>
  Math.min(100, Math.round((subtotal.value / FREE_SHIP) * 100)),
)
const grandTotal = computed(() => subtotal.value + shipping.value)

const needs = uniqueNeeds(products)

// detail-page content (derived, on-brand placeholders)
const detailIngredients = computed(() => {
  const p = selectedProduct.value
  if (!p) return []
  const protein = p.name.includes('鮭')
    ? '新鮮鮭魚'
    : p.name.includes('羊')
      ? '新鮮羊肉'
      : p.name.includes('鴨')
        ? '新鮮鴨肉'
        : p.name.includes('火雞')
          ? '新鮮火雞肉'
          : p.petType === 'cat'
            ? '新鮮魚肉'
            : '新鮮雞肉'
  return [
    { name: protein, pct: '36%' },
    { name: '馬鈴薯 / 鷹嘴豆', pct: '18%' },
    { name: '豌豆纖維', pct: '12%' },
    { name: '鮭魚油（Omega-3）', pct: '8%' },
    { name: '蔓越莓・藍莓', pct: '5%' },
    { name: '綜合維生素與礦物質', pct: '—' },
    { name: '益生菌 + 益生元', pct: '—' },
  ]
})

const detailHighlights = [
  { icon: '🌾', title: '無穀低敏', sub: '不使用易致敏穀物，呵護敏感腸胃' },
  { icon: '🍖', title: '真實肉塊', sub: '高含肉量，肉源清楚可追溯' },
  { icon: '🔬', title: 'SGS 檢驗', sub: '每批次送驗，安心看得見' },
]

const detailFeeding = [
  { w: '1 – 5 kg', g: '30 – 85 g' },
  { w: '5 – 10 kg', g: '85 – 145 g' },
  { w: '10 – 20 kg', g: '145 – 250 g' },
  { w: '20 kg 以上', g: '每 10kg 加 60 g' },
]

const reviews = [
  { name: '王小姐', pet: '柴犬・3 歲', avatar: '🐕', stars: '★★★★★', text: '換成這款後狗狗的便便變得很漂亮，毛色也亮亮的，一定會回購！' },
  { name: '陳先生', pet: '美短・5 歲', avatar: '🐈', stars: '★★★★★', text: '家裡的挑嘴貓終於願意乖乖吃飯了，顆粒大小剛好。' },
  { name: 'Lin', pet: '米克斯・2 歲', avatar: '🐩', stars: '★★★★☆', text: 'CP 值很高，出貨速度也很快，隔天就到了。' },
]

const detailTabs = [
  { key: 'intro', label: '商品介紹' },
  { key: 'ingredient', label: '成分分析' },
  { key: 'feeding', label: '餵食建議' },
  { key: 'review', label: '顧客評價' },
] as const


const summaryByMode = computed(() => {
  const modes: BenchmarkMode[] = ['with-webmcp', 'without-webmcp']
  return modes.map((itemMode) => {
    const runs = benchmark.history.value.filter((run) => run.mode === itemMode)
    const successful = runs.filter((run) => run.success)
    return {
      mode: itemMode,
      runs: runs.length,
      successRate: runs.length ? successful.length / runs.length : 0,
      avgDuration: average(successful.map((r) => r.durationMs)),
      avgUiActions: average(successful.map((r) => r.uiActionCount)),
      avgToolCalls: average(successful.map((r) => r.toolCallCount)),
    }
  })
})

watch([view, selectedId], () => {
  window.scrollTo({ top: 0, behavior: 'auto' })
})

// 抽屜關著測試時，頁面常駐的錄製徽章：完成後短暫顯示結果再淡出
const justCompleted = ref<BenchmarkRun | null>(null)
let completedTimer = 0
watch(benchmark.latestRun, (run) => {
  if (!run) return
  justCompleted.value = run
  window.clearTimeout(completedTimer)
  completedTimer = window.setTimeout(() => (justCompleted.value = null), 4000)
})

function fmtMs(value: number) {
  return `${(value / 1000).toFixed(1)}s`
}

// ---- handlers ----
function toast(message: string) {
  toastMsg.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toastMsg.value = ''), 1900)
}

function goHome() {
  view.value = 'shop'
  selectedId.value = null
  resetFilters()
}

function openCart() {
  view.value = 'cart'
}

function selectProduct(id: string) {
  selectedId.value = id
  detailTab.value = 'intro'
  detailQty.value = 1
  view.value = 'product'
}

function setSpecies(petType: PetType | 'all') {
  filters.petType = petType
  view.value = 'shop'
}

function setCategory(category: ProductCategory | 'all') {
  filters.category = category
  view.value = 'shop'
}

function setLifeStage(lifeStage: LifeStage | 'all') {
  filters.lifeStage = lifeStage
}

function toggleNeed(need: string) {
  filters.needs = filters.needs.includes(need)
    ? filters.needs.filter((n) => n !== need)
    : [...filters.needs, need]
}

function submitSearch() {
  filters.query = searchInput.value.trim()
  view.value = 'shop'
  selectedId.value = null
}

function clearSearch() {
  filters.query = ''
  searchInput.value = ''
}

function resetFilters() {
  Object.assign(filters, {
    query: '',
    petType: 'all',
    category: 'all',
    lifeStage: 'all',
    needs: [],
    maxPrice: 2000,
    minRating: 4.0,
    inStockOnly: false,
    sort: 'recommend',
  })
  searchInput.value = ''
}

function addToCart(id: string, qty = 1) {
  if (cart.add(id, qty)) {
    benchmark.recordCartMutation(id)
    const product = products.find((p) => p.id === id)
    toast(`已加入購物車${product ? '：' + product.name : ''}`)
  }
}

function buyNow(id: string, qty: number) {
  addToCart(id, qty)
  view.value = 'cart'
}

function updateCartQty(id: string, delta: number) {
  if (cart.update(id, delta)) benchmark.recordCartMutation(null)
}

function removeFromCart(id: string) {
  if (cart.remove(id)) benchmark.recordCartMutation(null)
}

function resetDemo() {
  benchmark.reset()
  cart.clear()
  resetFilters()
  selectedId.value = null
  view.value = 'shop'
}

async function copyPrompt() {
  await navigator.clipboard.writeText(scenarioConfig.value.prompt)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1400)
}

function average(values: number[]) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

const speciesChips: { key: PetType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'dog', label: '🐶 狗狗' },
  { key: 'cat', label: '🐱 貓咪' },
]

const categoryChips: { key: ProductCategory | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  ...(['food', 'supplement', 'toy', 'cleaning', 'travel'] as ProductCategory[]).map(
    (key) => ({ key, label: CATEGORY_LABEL[key] }),
  ),
]

const lifeStageChips: { key: LifeStage | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  ...(['puppy', 'kitten', 'adult', 'senior'] as LifeStage[]).map((key) => ({
    key,
    label: LIFE_STAGE_LABEL[key],
  })),
]

const sortOptions = [
  { key: 'recommend', label: '推薦排序' },
  { key: 'priceAsc', label: '價格低→高' },
  { key: 'priceDesc', label: '價格高→低' },
  { key: 'rating', label: '評價最高' },
]
</script>

<template>
  <div class="page">
    <!-- promo -->
    <div class="promo">🐾 {{ PROMO }}</div>

    <!-- header -->
    <header class="header">
      <div class="header-bar">
        <div class="brand" @click="goHome">
          <div class="brand-mark">🐾</div>
          <div class="brand-text">
            <div class="brand-name">毛日子</div>
            <div class="brand-en">FURDAYS</div>
          </div>
        </div>

        <form class="search" @submit.prevent="submitSearch">
          <input
            v-model="searchInput"
            data-benchmark-action="filter-query"
            placeholder="搜尋飼料、保健、玩具…（試試「sensitive-stomach」）"
          />
          <button type="submit" data-benchmark-action="search-submit">搜尋</button>
        </form>

        <div class="header-actions">
          <button class="member" type="button"><span>👤</span> 會員</button>
          <button class="cart-btn" type="button" data-benchmark-action="open-cart" @click="openCart">
            <span>🛒</span> 購物車
            <span class="cart-count">{{ cart.count }}</span>
          </button>
        </div>
      </div>

      <nav class="catnav">
        <button data-benchmark-action="nav-all" @click="goHome">全部商品</button>
        <button data-benchmark-action="nav-dog" @click="setSpecies('dog')">🐶 狗狗專區</button>
        <button data-benchmark-action="nav-cat" @click="setSpecies('cat')">🐱 貓咪專區</button>
        <button data-benchmark-action="nav-food" @click="setCategory('food')">主食</button>
        <button data-benchmark-action="nav-supp" @click="setCategory('supplement')">保健食品</button>
        <button data-benchmark-action="nav-toy" @click="setCategory('toy')">玩具</button>
        <span class="ship-hint">🚚 滿 {{ formatTwd(FREE_SHIP) }} 免運費</span>
      </nav>
    </header>

    <!-- ============ SHOP ============ -->
    <main v-if="view === 'shop'" class="wrap">
      <section v-if="!searchActive" class="hero">
        <div class="hero-blob a"></div>
        <div class="hero-blob b"></div>
        <div class="hero-copy">
          <div class="hero-pill">🐾 新鮮直送・產地嚴選</div>
          <h1>給毛孩每一天的<br />好食光 🍖</h1>
          <p>無穀低敏、看得見的真實肉塊。從幼犬到熟齡貓，毛日子都為牠們準備好營養滿分的鮮食。</p>
          <div class="hero-cta">
            <button class="hero-primary" data-benchmark-action="nav-dog" @click="setSpecies('dog')">🐶 逛狗狗專區</button>
            <button class="hero-ghost" data-benchmark-action="nav-cat" @click="setSpecies('cat')">🐱 逛貓咪專區</button>
          </div>
        </div>
        <div class="hero-bags">
          <div class="hero-bag cat"><div class="hero-bag-lip"></div><div class="hero-bag-mark">🐱<span>FURDAYS</span></div><div class="hero-bag-plate">鮮魚無穀貓糧</div></div>
          <div class="hero-bag dog"><div class="hero-bag-lip"></div><div class="hero-bag-mark">🐶<span>FURDAYS</span></div><div class="hero-bag-plate">鮮雞無穀犬糧</div></div>
        </div>
      </section>

      <div v-if="searchActive" class="search-head">
        <h2>搜尋「<span>{{ filters.query }}</span>」</h2>
        <span class="muted">找到 {{ visibleProducts.length }} 件商品</span>
        <button class="clear-search" data-benchmark-action="clear-search" @click="clearSearch">✕ 清除搜尋</button>
      </div>

      <div class="shop-grid">
        <!-- filters -->
        <aside class="filters">
          <div class="filters-head">
            <div class="filters-title">⚙️ 篩選</div>
            <button data-benchmark-action="clear-filters" @click="resetFilters">清除</button>
          </div>

          <div class="filter-label">寵物</div>
          <div class="chips">
            <button
              v-for="o in speciesChips"
              :key="o.key"
              class="chip"
              :class="{ active: filters.petType === o.key }"
              data-benchmark-action="filter-pet"
              @click="setSpecies(o.key)"
            >{{ o.label }}</button>
          </div>

          <div class="filter-label">商品類型</div>
          <div class="chips">
            <button
              v-for="o in categoryChips"
              :key="o.key"
              class="chip"
              :class="{ active: filters.category === o.key }"
              data-benchmark-action="filter-category"
              @click="setCategory(o.key)"
            >{{ o.label }}</button>
          </div>

          <div class="filter-label">生命階段</div>
          <div class="chips">
            <button
              v-for="o in lifeStageChips"
              :key="o.key"
              class="chip"
              :class="{ active: filters.lifeStage === o.key }"
              data-benchmark-action="filter-life-stage"
              @click="setLifeStage(o.key)"
            >{{ o.label }}</button>
          </div>

          <div class="filter-label">需求特色</div>
          <div class="chips">
            <button
              v-for="need in needs"
              :key="need"
              class="chip"
              :class="{ active: filters.needs.includes(need) }"
              data-benchmark-action="filter-need"
              @click="toggleNeed(need)"
            >{{ needLabel(need) }}</button>
          </div>

          <div class="filter-label spread">
            價格上限 <span class="accent">{{ formatTwd(filters.maxPrice) }}</span>
          </div>
          <input
            v-model.number="filters.maxPrice"
            data-benchmark-action="filter-price"
            type="range"
            min="200"
            max="2000"
            step="100"
            class="range"
          />
          <div class="range-ends"><span>NT$200</span><span>NT$2,000</span></div>

          <div class="filter-label spread">
            評分下限 <span class="accent">{{ filters.minRating.toFixed(1) }}★</span>
          </div>
          <input
            v-model.number="filters.minRating"
            data-benchmark-action="filter-rating"
            type="range"
            min="4"
            max="5"
            step="0.1"
            class="range"
          />

          <label class="stock-toggle">
            <input
              v-model="filters.inStockOnly"
              data-benchmark-action="filter-stock"
              type="checkbox"
            />
            只看有現貨
          </label>
        </aside>

        <!-- grid -->
        <div>
          <div class="grid-toolbar">
            <div class="muted">共 <strong>{{ visibleProducts.length }}</strong> 件商品</div>
            <label class="sort">
              排序
              <select v-model="filters.sort" data-benchmark-action="sort">
                <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
            </label>
          </div>

          <div v-if="visibleProducts.length" class="cards">
            <ProductCard
              v-for="p in visibleProducts"
              :key="p.id"
              :product="p"
              @select="selectProduct"
              @add="addToCart($event)"
            />
          </div>
          <div v-else class="empty">
            <div class="empty-icon">🐾</div>
            <div class="empty-title">找不到符合的商品</div>
            <p>試試調整篩選條件，或看看其他熱銷品項</p>
            <button class="solid" data-benchmark-action="clear-filters" @click="resetFilters">重設條件</button>
          </div>
        </div>
      </div>
    </main>

    <!-- ============ PRODUCT DETAIL ============ -->
    <main v-else-if="view === 'product' && selectedProduct" class="wrap narrow">
      <div class="crumb">
        <span @click="goHome">首頁</span><span>›</span>
        <span @click="setSpecies(selectedProduct.petType)">{{ selectedProduct.petTypeLabel }}專區</span><span>›</span>
        <span class="cur">{{ selectedProduct.name }}</span>
      </div>

      <div class="detail">
        <div class="gallery">
          <div class="gallery-stage" :style="{ background: selectedProduct.tone }">
            <span v-if="selectedProduct.badge" class="badge" :class="{ muted: !selectedProduct.inStock }">{{ selectedProduct.badge }}</span>
            <div class="bag big" :style="{ background: selectedProduct.bagColor }">
              <div class="bag-lip" :style="{ background: selectedProduct.bagColor2 }"></div>
              <div class="bag-mark"><div class="bag-icon">{{ selectedProduct.icon }}</div><div class="bag-brand">FURDAYS</div></div>
              <div class="bag-plate">{{ selectedProduct.shortName }}</div>
            </div>
          </div>
        </div>

        <div class="info">
          <div class="info-tags">
            <span v-for="t in selectedProduct.tags" :key="t">{{ t }}</span>
          </div>
          <h1>{{ selectedProduct.name }}</h1>
          <div class="info-rating">
            <span class="stars">★★★★★</span>
            <strong>{{ selectedProduct.rating.toFixed(1) }}</strong>
            <span class="muted">・ 已售 {{ selectedProduct.reviews }}＋</span>
          </div>

          <div class="price-box">
            <span class="cur">NT$</span><span class="num">{{ selectedProduct.priceStr }}</span>
          </div>

          <div class="spec-label">規格</div>
          <div class="specs">
            <span class="spec on">{{ selectedProduct.lifeStageLabel }}</span>
            <span class="spec">{{ selectedProduct.categoryLabel }}</span>
            <span class="spec" :class="{ off: !selectedProduct.inStock }">{{ selectedProduct.inStock ? '現貨' : '補貨中' }}</span>
          </div>

          <div class="qty-row">
            <div class="spec-label inline">數量</div>
            <div class="stepper">
              <button data-benchmark-action="detail-qty-dec" @click="detailQty = Math.max(1, detailQty - 1)">−</button>
              <div>{{ detailQty }}</div>
              <button data-benchmark-action="detail-qty-inc" @click="detailQty += 1">＋</button>
            </div>
          </div>

          <div class="buy-row">
            <button
              class="add-cart"
              data-benchmark-action="detail-add-to-cart"
              :disabled="!selectedProduct.inStock"
              @click="addToCart(selectedProduct.id, detailQty)"
            >🛒 加入購物車</button>
            <button
              class="buy-now"
              data-benchmark-action="detail-buy-now"
              :disabled="!selectedProduct.inStock"
              @click="buyNow(selectedProduct.id, detailQty)"
            >直接購買</button>
          </div>

          <div class="perks">
            <div><span>🚚</span> 滿 {{ formatTwd(FREE_SHIP) }} 免運費，最快隔日到貨</div>
            <div><span>↩️</span> 7 天鑑賞期，毛孩不愛可退換</div>
            <div><span>🛡️</span> 原廠正品保證・通過 SGS 檢驗</div>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button
          v-for="t in detailTabs"
          :key="t.key"
          :class="{ active: detailTab === t.key }"
          data-benchmark-action="detail-tab"
          @click="detailTab = t.key"
        >{{ t.label }}</button>
      </div>

      <div class="tab-panel">
        <template v-if="detailTab === 'intro'">
          <p class="intro-desc">{{ selectedProduct.details }}</p>
          <div class="highlights">
            <div v-for="h in detailHighlights" :key="h.title" class="highlight">
              <div class="h-icon">{{ h.icon }}</div>
              <div class="h-title">{{ h.title }}</div>
              <div class="h-sub">{{ h.sub }}</div>
            </div>
          </div>
        </template>
        <template v-else-if="detailTab === 'ingredient'">
          <div class="panel-title">成分組成（前 7 大原料）</div>
          <div class="ingredients">
            <div v-for="ing in detailIngredients" :key="ing.name" class="ingredient">
              <span class="dot"></span><span class="ing-name">{{ ing.name }}</span><span class="ing-pct">{{ ing.pct }}</span>
            </div>
          </div>
          <div class="panel-note">✔ 無添加人工色素、香料與防腐劑　✔ 不使用 4D 肉類　✔ 低敏配方</div>
        </template>
        <template v-else-if="detailTab === 'feeding'">
          <div class="panel-title">每日建議餵食量</div>
          <div class="feeding">
            <div class="feeding-head"><div>體重</div><div>每日份量</div></div>
            <div v-for="f in detailFeeding" :key="f.w" class="feeding-row"><div>{{ f.w }}</div><div>{{ f.g }}</div></div>
          </div>
          <div class="panel-note light">※ 以上為參考值，請依毛孩活動量、年齡與體態微調。換糧建議以 7 天漸進方式混合。</div>
        </template>
        <template v-else>
          <div class="review-summary">
            <div class="review-score"><div class="big">{{ selectedProduct.rating.toFixed(1) }}</div><div class="stars">★★★★★</div></div>
            <div class="muted">超過 {{ selectedProduct.reviews }} 位毛爸毛媽的真實評價<br />98% 願意再次回購</div>
          </div>
          <div class="reviews">
            <div v-for="r in reviews" :key="r.name" class="review">
              <div class="avatar">{{ r.avatar }}</div>
              <div>
                <div class="review-meta"><strong>{{ r.name }}</strong><span class="muted">{{ r.pet }}</span><span class="stars">{{ r.stars }}</span></div>
                <div class="review-text">{{ r.text }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="section-title">毛孩也喜歡 🐾</div>
      <div class="cards four">
        <ProductCard
          v-for="p in relatedProducts"
          :key="p.id"
          :product="p"
          @select="selectProduct"
          @add="addToCart($event)"
        />
      </div>
    </main>

    <!-- ============ CART ============ -->
    <main v-else-if="view === 'cart'" class="wrap narrow">
      <h1 class="cart-title">🛒 購物車</h1>

      <div v-if="cartLines.length === 0" class="empty">
        <div class="empty-icon">🐱</div>
        <div class="empty-title">購物車是空的</div>
        <p>帶毛孩最愛的鮮食回家吧！</p>
        <button class="solid" @click="goHome">去逛逛 →</button>
      </div>

      <div v-else class="cart-grid">
        <div class="cart-lines">
          <div v-for="line in cartLines" :key="line.id" class="cart-line">
            <div class="line-thumb" :style="{ background: line.product.tone }">{{ line.product.icon }}</div>
            <div class="line-info">
              <div class="line-name">{{ line.product.name }}</div>
              <div class="muted">{{ line.product.categoryLabel }} ・ 單價 {{ formatTwd(line.product.price) }}</div>
            </div>
            <div class="stepper sm">
              <button data-benchmark-action="cart-qty-dec" @click="updateCartQty(line.id, -1)">−</button>
              <div>{{ line.qty }}</div>
              <button data-benchmark-action="cart-qty-inc" @click="updateCartQty(line.id, 1)">＋</button>
            </div>
            <div class="line-total">{{ formatTwd(line.lineTotal) }}</div>
            <button class="line-remove" data-benchmark-action="remove-cart-item" @click="removeFromCart(line.id)">✕</button>
          </div>
        </div>

        <aside class="summary">
          <div class="summary-title">訂單摘要</div>
          <div class="ship-meter">
            <div v-if="freeShip" class="ship-ok">🎉 已達免運門檻！</div>
            <div v-else class="ship-need">再買 <span>{{ formatTwd(remaining) }}</span> 即可免運 🚚</div>
            <div class="meter"><div class="meter-fill" :style="{ width: shipPct + '%' }"></div></div>
          </div>
          <div class="summary-row"><span>商品小計</span><strong>{{ formatTwd(subtotal) }}</strong></div>
          <div class="summary-row"><span>運費</span><strong>{{ shipping === 0 ? '免費' : formatTwd(shipping) }}</strong></div>
          <div class="summary-sep"></div>
          <div class="summary-total"><span>應付總額</span><strong>{{ formatTwd(grandTotal) }}</strong></div>
          <button class="checkout">前往結帳 →</button>
          <div class="pays"><span>VISA</span><span>Master</span><span>LINE Pay</span><span>7-11 取貨</span></div>
        </aside>
      </div>

      <template v-if="cartLines.length && recommendProducts.length">
        <div class="section-title sm">推薦加購 🛍️</div>
        <div class="cards three">
          <ProductCard
            v-for="p in recommendProducts"
            :key="p.id"
            :product="p"
            @select="selectProduct"
            @add="addToCart($event)"
          />
        </div>
      </template>
    </main>

    <!-- footer -->
    <footer class="footer">
      <div class="footer-grid">
        <div>
          <div class="footer-brand"><div class="brand-mark sm">🐾</div><div>毛日子 FURDAYS</div></div>
          <p>用對待家人的心，為每隻毛孩準備新鮮、安心、營養均衡的每一餐。</p>
        </div>
        <div><div class="footer-col-title">關於毛日子</div><span>品牌故事</span><span>製程與檢驗</span><span>門市據點</span></div>
        <div><div class="footer-col-title">購物指南</div><span>運送與付款</span><span>退換貨政策</span><span>常見問題</span></div>
        <div><div class="footer-col-title">訂閱毛日子</div><p>新會員首購享 9 折優惠</p></div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 毛日子 FURDAYS. 此為 WebMCP 效能展示用 Demo 網站。</span>
        <span>隱私權政策 ・ 服務條款</span>
      </div>
    </footer>

    <!-- recording badge (visible with drawer closed) -->
    <Transition name="rec">
      <button
        v-if="benchmark.armed.value || justCompleted"
        class="rec-badge"
        :class="{
          live: benchmark.armed.value && benchmark.liveDurationMs.value > 0,
          standby: benchmark.armed.value && benchmark.liveDurationMs.value === 0,
          done: !benchmark.armed.value && justCompleted,
          fail: !benchmark.armed.value && justCompleted && !justCompleted.success,
        }"
        title="開啟 Agent 效能對比"
        @click="drawerOpen = true"
      >
        <template v-if="benchmark.armed.value">
          <span class="rec-dot"></span>
          <span class="rec-text">{{ benchmark.liveDurationMs.value > 0 ? 'REC' : '待命' }}</span>
          <span class="rec-time">{{ fmtMs(benchmark.liveDurationMs.value) }}</span>
        </template>
        <template v-else-if="justCompleted">
          <span class="rec-icon">{{ justCompleted.success ? '✓' : '■' }}</span>
          <span class="rec-text">{{ justCompleted.success ? '完成' : '結束' }}</span>
          <span class="rec-time">{{ fmtMs(justCompleted.durationMs) }}</span>
        </template>
      </button>
    </Transition>

    <!-- floating benchmark button -->
    <button class="bench-fab" data-benchmark-action="open-benchmark" @click="drawerOpen = true">
      <span class="fab-icon">🤖</span> Agent 效能對比
    </button>

    <BenchmarkDrawer
      :open="drawerOpen"
      :mode="mode"
      :scenario-config="scenarioConfig"
      :products="products"
      :webmcp-status="webMcp.statusMessage.value"
      :webmcp-available="webMcp.isAvailable.value"
      :webmcp-error="webMcp.errorMessage.value"
      :tool-count="webMcp.registeredToolCount.value"
      :armed="benchmark.armed.value"
      :live-ms="benchmark.liveDurationMs.value"
      :ui-actions="benchmark.uiActionCount.value"
      :tool-calls="benchmark.toolCallCount.value"
      :cart-mutations="benchmark.cartMutationCount.value"
      :tool-log="benchmark.toolCalls.value"
      :latest-run="benchmark.latestRun.value"
      :summary="summaryByMode"
      :copied="copied"
      @close="drawerOpen = false"
      @arm="benchmark.arm"
      @reset="resetDemo"
      @copy="copyPrompt"
      @update:scenario-config="scenarioConfig = $event"
    />

    <!-- toast -->
    <Transition name="toast">
      <div v-if="toastMsg" class="toast">✅ {{ toastMsg }}</div>
    </Transition>
  </div>
</template>
