<script setup>
// Seletor de cor e grossura da linha do cabo (usado no painel e na barra de tracado).
defineProps({ color: { type: String, default: '#dc2626' }, weight: { type: Number, default: 4 }, compact: Boolean })
const emit = defineEmits(['update:color', 'update:weight'])

const COLORS = [
  ['#dc2626', 'Vermelho'], ['#2563eb', 'Azul'], ['#16a34a', 'Verde'], ['#f59e0b', 'Laranja'], ['#7c3aed', 'Roxo'],
  ['#eab308', 'Amarelo'], ['#0891b2', 'Ciano'], ['#db2777', 'Rosa'], ['#92400e', 'Marrom'], ['#111827', 'Preto'],
]
const WEIGHTS = [[2, 'Fino'], [4, 'Normal'], [6, 'Grosso'], [9, 'Extra grosso']]
</script>

<template>
  <div class="cs" :class="{ compact }">
    <div class="grp">
      <span v-if="!compact" class="lab">Cor do cabo</span>
      <div class="row">
        <button v-for="c in COLORS" :key="c[0]" type="button" class="sw" :class="{ on: color === c[0] }"
          :style="{ background: c[0] }" :title="c[1]" :aria-label="c[1]" @click="emit('update:color', c[0])"></button>
        <input type="color" class="pick" :value="color" title="Outra cor" aria-label="Outra cor"
          @input="emit('update:color', $event.target.value)" />
      </div>
    </div>
    <div class="grp">
      <span v-if="!compact" class="lab">Grossura da linha</span>
      <div class="row">
        <button v-for="w in WEIGHTS" :key="w[0]" type="button" class="wt" :class="{ on: weight === w[0] }"
          :title="w[1]" @click="emit('update:weight', w[0])">
          <i :style="{ height: w[0] + 'px', background: color }"></i>
          <small>{{ w[1] }}</small>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cs { display: flex; flex-direction: column; gap: 10px; margin: 12px 0 4px; }
.cs.compact { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 14px; margin: 0; }
.lab { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.sw { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--line); cursor: pointer; padding: 0; }
.sw.on { box-shadow: 0 0 0 2px var(--ink); }
.pick { width: 28px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: none; cursor: pointer; }
.wt { display: flex; flex-direction: column; justify-content: center; gap: 4px; width: 62px; padding: 6px 6px 4px; background: #fff;
  border: 1px solid var(--line); border-radius: var(--radius); cursor: pointer; }
.wt i { display: block; width: 100%; border-radius: 2px; }
.wt small { font-size: 10px; color: var(--muted); text-align: center; }
.wt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, white); }
</style>
