<script setup lang="ts">
import type { ProductView } from '../utils/productVisuals'

defineProps<{
  product: ProductView
  highlighted?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  add: [id: string]
}>()
</script>

<template>
  <article
    class="card"
    :class="{ highlighted, soldout: !product.inStock }"
    data-benchmark-action="select-product"
    @click="emit('select', product.id)"
  >
    <div v-if="highlighted" class="agent-ring" aria-hidden="true"></div>
    <div v-if="highlighted" class="agent-tag">🤖 Agent 操作中</div>

    <!-- 飼料袋插畫 -->
    <div class="thumb" :style="{ background: product.tone }">
      <span v-if="product.badge" class="badge" :class="{ muted: !product.inStock }">
        {{ product.badge }}
      </span>
      <span class="stage-pill">{{ product.lifeStageLabel }}</span>

      <div class="bag" :style="{ background: product.bagColor }">
        <div class="bag-lip" :style="{ background: product.bagColor2 }"></div>
        <div class="bag-mark">
          <div class="bag-icon">{{ product.icon }}</div>
          <div class="bag-brand">FURDAYS</div>
        </div>
        <div class="bag-plate">{{ product.shortName }}</div>
      </div>
    </div>

    <div class="body">
      <div class="tags">
        <span v-for="tag in product.tags.slice(0, 2)" :key="tag">{{ tag }}</span>
      </div>
      <div class="name">{{ product.name }}</div>
      <div class="rating">
        <span class="star">★</span>
        <strong>{{ product.rating.toFixed(1) }}</strong>
        <span>({{ product.reviews }})</span>
      </div>
      <div class="footer">
        <div class="price">
          <span class="cur">NT$</span><span class="num">{{ product.priceStr }}</span>
        </div>
        <button
          type="button"
          class="add"
          data-benchmark-action="add-to-cart"
          :disabled="!product.inStock"
          :title="product.inStock ? '加入購物車' : '補貨中'"
          @click.stop="emit('add', product.id)"
        >
          ＋
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid #f1e4d6;
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 16px 32px rgba(232, 95, 44, 0.16);
  border-color: #fad9c2;
}
.card.soldout {
  opacity: 0.78;
}

.agent-ring {
  position: absolute;
  inset: 0;
  border: 3px solid #ff7a48;
  border-radius: 20px;
  box-shadow: 0 0 0 5px rgba(255, 122, 72, 0.22);
  pointer-events: none;
  z-index: 6;
}
.agent-tag {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  background: #3a2a20;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.thumb {
  position: relative;
  height: 200px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}
.badge {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
  background: #ff5a3d;
  color: #fff;
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.badge.muted {
  background: #b7a294;
}
.stage-pill {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  background: #fff;
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 12px;
  font-weight: 800;
  color: #e85f2c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.bag {
  width: 108px;
  height: 150px;
  border-radius: 16px 16px 10px 10px;
  position: relative;
  box-shadow: 0 12px 22px rgba(0, 0, 0, 0.16);
  margin-bottom: -6px;
}
.bag-lip {
  position: absolute;
  top: -8px;
  left: 12px;
  right: 12px;
  height: 15px;
  border-radius: 7px;
}
.bag-mark {
  position: absolute;
  top: 22px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.bag-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
}
.bag-brand {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.95);
  font-family: 'Baloo 2', sans-serif;
}
.bag-plate {
  position: absolute;
  bottom: 13px;
  left: 10px;
  right: 10px;
  height: 42px;
  background: #fff;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3px;
  font-size: 11px;
  font-weight: 700;
  color: #3a2a20;
  line-height: 1.25;
}

.body {
  padding: 14px 15px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.tags span {
  font-size: 10.5px;
  font-weight: 600;
  color: #c2783d;
  background: #fff1e5;
  border-radius: 6px;
  padding: 3px 7px;
}
.name {
  font-weight: 700;
  font-size: 14px;
  color: #3a2a20;
  line-height: 1.4;
  min-height: 39px;
}
.rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #9a8576;
}
.rating .star {
  color: #ffb22e;
  font-size: 13px;
}
.rating strong {
  color: #5c4636;
}
.footer {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}
.price {
  display: flex;
  align-items: baseline;
  gap: 3px;
  color: #e85f2c;
}
.price .cur {
  font-size: 13px;
  font-weight: 700;
}
.price .num {
  font-size: 21px;
  font-weight: 800;
  font-family: 'Baloo 2', sans-serif;
}
.add {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: none;
  background: #ffefe4;
  color: #e85f2c;
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  line-height: 1;
  transition: all 0.15s;
}
.add:hover:not(:disabled) {
  background: #ff7a48;
  color: #fff;
}
.add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
