import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Product } from '../types'
import { filterProducts } from '../utils/productFilters'
import { useCartStore } from '../stores/cart'

interface UseWebMcpToolsOptions {
  enabled: boolean
  products: Product[]
  cart: ReturnType<typeof useCartStore>
  recordCartMutation: (productId?: string | null) => void
  recordToolCall: <T>(name: string, handler: () => Promise<T> | T) => Promise<T>
}

interface ToolInput {
  productId?: string
  quantity?: number
  query?: string
  petType?: string
  category?: string
  lifeStage?: string
  needs?: string[] | string
  maxPrice?: number
  minRating?: number
  inStockOnly?: boolean
  limit?: number
}

export function useWebMcpTools(options: UseWebMcpToolsOptions) {
  const registeredToolCount = ref(0)
  const statusMessage = ref('checking')
  const errorMessage = ref('')
  const abortController = ref<AbortController | null>(null)

  const isAvailable = computed(() => typeof document.modelContext?.registerTool === 'function')

  function register() {
    cleanup()
    errorMessage.value = ''

    if (!options.enabled) {
      statusMessage.value = 'disabled for this route'
      return
    }

    if (!isAvailable.value) {
      statusMessage.value = 'document.modelContext unavailable'
      return
    }

    const controller = new AbortController()
    abortController.value = controller
    const tools = createTools(options)

    try {
      tools.forEach((tool) => {
        document.modelContext?.registerTool(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
          },
          tool.handler,
          { signal: controller.signal },
        )
      })
      registeredToolCount.value = tools.length
      statusMessage.value = 'registered'
    } catch (error) {
      registeredToolCount.value = 0
      statusMessage.value = 'registration failed'
      errorMessage.value = error instanceof Error ? error.message : String(error)
      controller.abort()
    }
  }

  function cleanup() {
    abortController.value?.abort()
    abortController.value = null
    registeredToolCount.value = 0
  }

  watch(() => options.enabled, register, { immediate: true })

  onBeforeUnmount(cleanup)

  return {
    isAvailable,
    registeredToolCount,
    statusMessage,
    errorMessage,
    register,
    cleanup,
  }
}

function createTools(options: UseWebMcpToolsOptions) {
  return [
    {
      name: 'search_pet_products',
      description:
        'Search the pet product catalog by pet type, category, life stage, need tags, price, rating, stock, and text query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          petType: { type: 'string', enum: ['dog', 'cat', 'all'] },
          category: {
            type: 'string',
            enum: ['food', 'supplement', 'toy', 'cleaning', 'travel', 'all'],
          },
          lifeStage: {
            type: 'string',
            enum: ['puppy', 'kitten', 'adult', 'senior', 'all'],
          },
          needs: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          maxPrice: { type: 'number' },
          minRating: { type: 'number' },
          inStockOnly: { type: 'boolean' },
          limit: { type: 'number', minimum: 1, maximum: 20 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      handler: (input: unknown) =>
        options.recordToolCall('search_pet_products', () => {
          const args = normalizeToolInput(input)
          const matches = filterProducts(options.products, {
            query: args.query,
            petType: normalizeEnum(args.petType, ['dog', 'cat', 'all']),
            category: normalizeEnum(args.category, [
              'food',
              'supplement',
              'toy',
              'cleaning',
              'travel',
              'all',
            ]),
            lifeStage: normalizeEnum(args.lifeStage, [
              'puppy',
              'kitten',
              'adult',
              'senior',
              'all',
            ]),
            needs: normalizeNeeds(args.needs),
            maxPrice: asFiniteNumber(args.maxPrice),
            minRating: asFiniteNumber(args.minRating),
            inStockOnly: args.inStockOnly,
          }).slice(0, clampLimit(args.limit))

          return {
            count: matches.length,
            products: matches.map(toShortProduct),
          }
        }),
    },
    {
      name: 'get_pet_product_details',
      description: 'Get full details for a pet product by productId.',
      inputSchema: {
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      handler: (input: unknown) =>
        options.recordToolCall('get_pet_product_details', () => {
          const productId = normalizeToolInput(input).productId
          const product = options.products.find((item) => item.id === productId)
          if (!product) throw new Error(`Unknown productId: ${productId}`)
          return product
        }),
    },
    {
      name: 'add_pet_product_to_cart',
      description:
        'Add an in-stock pet product to the cart. Use quantity 1 for the benchmark task unless the user asks otherwise.',
      inputSchema: {
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number', minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
      handler: (input: unknown) =>
        options.recordToolCall('add_pet_product_to_cart', () => {
          const args = normalizeToolInput(input)
          const quantity = Math.max(1, Math.min(10, Math.floor(args.quantity ?? 1)))
          const ok = args.productId ? options.cart.add(args.productId, quantity) : false
          if (!ok) throw new Error(`Cannot add productId: ${args.productId}`)

          options.recordCartMutation(args.productId)
          return {
            ok: true,
            added: { productId: args.productId, quantity },
            cart: toCartOutput(options.cart),
          }
        }),
    },
    {
      name: 'view_cart',
      description: 'View current cart line items, quantities, and total price.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      handler: () =>
        options.recordToolCall('view_cart', () => ({
          cart: toCartOutput(options.cart),
        })),
    },
  ]
}

function normalizeToolInput(input: unknown): ToolInput {
  if (typeof input !== 'object' || input === null) return {}
  return input as ToolInput
}

function normalizeNeeds(needs: ToolInput['needs']) {
  if (Array.isArray(needs)) return needs.filter((need) => typeof need === 'string')
  if (typeof needs === 'string') return [needs]
  return []
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : undefined
}

function asFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clampLimit(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 8
  return Math.max(1, Math.min(20, Math.floor(value)))
}

function toShortProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    petType: product.petType,
    category: product.category,
    lifeStage: product.lifeStage,
    needs: product.needs,
    price: product.price,
    rating: product.rating,
    inStock: product.inStock,
  }
}

function toCartOutput(cart: ReturnType<typeof useCartStore>) {
  return {
    items: cart.lineItems.map((item) => ({
      productId: item.productId,
      name: item.product?.name ?? 'Unknown product',
      quantity: item.quantity,
      lineTotal: (item.product?.price ?? 0) * item.quantity,
    })),
    count: cart.count,
    total: cart.total,
  }
}
