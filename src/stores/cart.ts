import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { products } from '../data/products'

export const useCartStore = defineStore('cart', () => {
  const items = ref(new Map<string, number>())

  const lineItems = computed(() =>
    Array.from(items.value.entries()).map(([productId, quantity]) => {
      const product = products.find((item) => item.id === productId)
      return { productId, quantity, product }
    }),
  )

  const count = computed(() =>
    Array.from(items.value.values()).reduce((total, quantity) => total + quantity, 0),
  )

  const total = computed(() =>
    lineItems.value.reduce(
      (sum, item) => sum + (item.product?.price ?? 0) * item.quantity,
      0,
    ),
  )

  function add(productId: string, quantity = 1) {
    const product = products.find((item) => item.id === productId)
    if (!product || !product.inStock) return false

    items.value = new Map(items.value).set(
      productId,
      (items.value.get(productId) ?? 0) + quantity,
    )
    return true
  }

  function remove(productId: string) {
    const nextItems = new Map(items.value)
    const didRemove = nextItems.delete(productId)
    items.value = nextItems
    return didRemove
  }

  function clear() {
    if (items.value.size === 0) return false
    items.value = new Map()
    return true
  }

  function quantityOf(productId: string) {
    return items.value.get(productId) ?? 0
  }

  return { items, lineItems, count, total, add, remove, clear, quantityOf }
})
