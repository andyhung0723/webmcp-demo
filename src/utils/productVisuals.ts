import type { LifeStage, PetType, Product, ProductCategory } from '../types'

/**
 * 純衍生層：不動 benchmark 題庫資料，只把現有 Product 映射成毛日子卡片
 * 需要的視覺欄位（飼料袋配色、icon、短名、評論數）與中文標籤。
 */

interface CategoryPalette {
  tone: string
  bag: string
  bag2: string
}

const FOOD_DOG: CategoryPalette = { tone: '#FFE7D2', bag: '#E0742C', bag2: '#C5611F' }
const FOOD_CAT: CategoryPalette = { tone: '#D9ECFB', bag: '#3A6FB5', bag2: '#2E5C99' }

const CATEGORY_PALETTE: Record<Exclude<ProductCategory, 'food'>, CategoryPalette> = {
  supplement: { tone: '#D7F0E6', bag: '#2FA886', bag2: '#23866A' },
  toy: { tone: '#FFF0C9', bag: '#D6A52A', bag2: '#BA841F' },
  cleaning: { tone: '#ECE3FB', bag: '#8A6BC9', bag2: '#6E51AE' },
  travel: { tone: '#FCE0E6', bag: '#D9617E', bag2: '#BF4E69' },
}

function paletteOf(product: Product): CategoryPalette {
  if (product.category === 'food') return product.petType === 'cat' ? FOOD_CAT : FOOD_DOG
  return CATEGORY_PALETTE[product.category]
}

function iconOf(product: Product): string {
  switch (product.category) {
    case 'food':
      return product.petType === 'cat' ? '🐱' : '🐶'
    case 'supplement':
      return '💧'
    case 'toy':
      return product.petType === 'cat' ? '🪶' : '🦴'
    case 'cleaning':
      return '🧼'
    case 'travel':
      return '🎒'
  }
}

/** 去掉商品名前綴的英文品牌字，留下中文短名作為飼料袋標籤。 */
function shortNameOf(name: string): string {
  const cjk = name.replace(/^[A-Za-z0-9\s\-+&'’.]+/, '').trim()
  return cjk || name
}

/** 由評分與價格產生穩定的「已售/評論數」，純展示用。 */
function reviewsOf(product: Product): number {
  return (Math.round(product.rating * 97 + product.price * 0.13) % 520) + 86
}

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  food: '主食',
  supplement: '保健',
  toy: '玩具',
  cleaning: '清潔',
  travel: '外出',
}

export const LIFE_STAGE_LABEL: Record<LifeStage, string> = {
  puppy: '幼犬',
  kitten: '幼貓',
  adult: '成犬/貓',
  senior: '熟齡',
  all: '全年齡',
}

export const PET_TYPE_LABEL: Record<PetType, string> = {
  dog: '狗狗',
  cat: '貓咪',
}

const NEED_LABEL: Record<string, string> = {
  'sensitive-stomach': '腸胃敏感',
  'daily-nutrition': '日常營養',
  'grain-free': '無穀',
  'high-protein': '高蛋白',
  'joint-care': '關節保健',
  growth: '成長期',
  'skin-coat': '皮毛照護',
  hairball: '毛球控制',
  'limited-ingredient': '單一蛋白',
  'gut-health': '腸道健康',
  'urinary-care': '泌尿保健',
  'mental-stimulation': '益智',
  'slow-feeding': '慢食',
  exercise: '運動',
  'dental-care': '潔牙',
  chewing: '咀嚼',
  'odor-control': '除臭',
  'low-dust': '低粉塵',
  'sensitive-skin': '敏感肌',
  walking: '散步',
  safety: '安全',
  travel: '外出',
}

export function needLabel(need: string): string {
  return NEED_LABEL[need] ?? need
}

export interface ProductView extends Product {
  icon: string
  tone: string
  bagColor: string
  bagColor2: string
  shortName: string
  reviews: number
  priceStr: string
  categoryLabel: string
  lifeStageLabel: string
  petTypeLabel: string
  badge: string
  needLabels: string[]
}

const PRICE_FORMAT = new Intl.NumberFormat('zh-TW')

/** 把題庫 Product 裝飾成卡片/詳情頁可直接綁定的 view model。 */
export function decorateProduct(product: Product): ProductView {
  const palette = paletteOf(product)
  return {
    ...product,
    icon: iconOf(product),
    tone: palette.tone,
    bagColor: palette.bag,
    bagColor2: palette.bag2,
    shortName: shortNameOf(product.name),
    reviews: reviewsOf(product),
    priceStr: PRICE_FORMAT.format(product.price),
    categoryLabel: CATEGORY_LABEL[product.category],
    lifeStageLabel: LIFE_STAGE_LABEL[product.lifeStage],
    petTypeLabel: PET_TYPE_LABEL[product.petType],
    badge: !product.inStock ? '補貨中' : product.rating >= 4.8 ? '熱銷' : '',
    needLabels: product.needs.map(needLabel),
  }
}

export function formatTwd(value: number): string {
  return `NT$${PRICE_FORMAT.format(value)}`
}
