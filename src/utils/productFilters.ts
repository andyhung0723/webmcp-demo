import type { LifeStage, PetType, Product, ProductCategory } from '../types'

export interface ProductFilterInput {
  query?: string
  petType?: PetType | 'all'
  category?: ProductCategory | 'all'
  lifeStage?: LifeStage | 'all'
  needs?: string[]
  maxPrice?: number
  minRating?: number
  inStockOnly?: boolean
}

export function filterProducts(products: Product[], filters: ProductFilterInput) {
  const query = normalize(filters.query)

  return products.filter((product) => {
    if (
      query &&
      !normalize(
        `${product.name} ${product.summary} ${product.tags.join(' ')} ${product.needs.join(' ')}`,
      ).includes(query)
    ) {
      return false
    }

    if (filters.petType && filters.petType !== 'all' && product.petType !== filters.petType) {
      return false
    }

    if (
      filters.category &&
      filters.category !== 'all' &&
      product.category !== filters.category
    ) {
      return false
    }

    if (
      filters.lifeStage &&
      filters.lifeStage !== 'all' &&
      product.lifeStage !== filters.lifeStage &&
      product.lifeStage !== 'all'
    ) {
      return false
    }

    if (
      filters.needs?.length &&
      !filters.needs.every((need) => product.needs.includes(need))
    ) {
      return false
    }

    if (typeof filters.maxPrice === 'number' && product.price > filters.maxPrice) {
      return false
    }

    if (typeof filters.minRating === 'number' && product.rating < filters.minRating) {
      return false
    }

    if (filters.inStockOnly && !product.inStock) return false

    return true
  })
}

export function uniqueNeeds(products: Product[]) {
  return Array.from(new Set(products.flatMap((product) => product.needs))).sort()
}

function normalize(value = '') {
  return value.trim().toLowerCase()
}
