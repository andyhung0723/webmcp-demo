export type BenchmarkMode = 'with-webmcp' | 'without-webmcp' | 'backend'
export type PetType = 'dog' | 'cat'
export type ProductCategory =
  | 'food'
  | 'supplement'
  | 'toy'
  | 'cleaning'
  | 'travel'
export type LifeStage = 'puppy' | 'kitten' | 'adult' | 'senior' | 'all'

export interface Product {
  id: string
  name: string
  petType: PetType
  category: ProductCategory
  lifeStage: LifeStage
  needs: string[]
  price: number
  rating: number
  inStock: boolean
  tags: string[]
  summary: string
  details: string
}

export interface CartItem {
  productId: string
  quantity: number
}

export interface ScenarioConfig {
  title: string
  prompt: string
  expectedProductId: string
  expectedQuantity: number
}

export interface BenchmarkScenario {
  id: string
  title: string
  prompt: string
  expectedProductId: string
  expectedQuantity: number
  criteria: {
    petType: PetType
    category: ProductCategory
    lifeStage: LifeStage
    needs: string[]
    maxPrice: number
    minRating: number
    inStock: true
  }
}

export interface BenchmarkRun {
  id: string
  mode: BenchmarkMode
  scenarioId: string
  durationMs: number
  uiActionCount: number
  toolCallCount: number
  cartMutationCount: number
  selectedProductId: string | null
  success: boolean
  startedAt: string
  completedAt: string
}

export interface ToolCallLog {
  id: string
  name: string
  status: 'running' | 'success' | 'error'
  startedAt: number
  durationMs?: number
  error?: string
}
