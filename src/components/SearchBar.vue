<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  results: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Buscar CTO, cliente, cabo ou observação…' },
})
const emit = defineEmits(['update:modelValue', 'update:open', 'select'])

const active = ref(-1)
const visible = computed(() => props.open && props.modelValue.trim().length >= 2)

function onInput(e) {
  emit('update:modelValue', e.target.value)
  emit('update:open', true)
  active.value = -1
}
function choose(r) {
  active.value = -1
  emit('update:open', false)
  emit('select', r)
}
function clear() {
  active.value = -1
  emit('update:modelValue', '')
  emit('update:open', false)
}
function onKeydown(e) {
  if (e.key === 'Escape') {
    emit('update:open', false)
    active.value = -1
    return
  }
  if (!visible.value || !props.results.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % props.results.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + props.results.length) % props.results.length
  } else if (e.key === 'Enter' && active.value >= 0) {
    e.preventDefault()
    choose(props.results[active.value])
  }
}
</script>

<template>
  <div class="search">
    <input :value="modelValue" type="search" :placeholder="placeholder" aria-label="Buscar" autocomplete="off"
      @input="onInput" @focus="emit('update:open', true)" @keydown="onKeydown" />
    <button v-if="modelValue" type="button" class="clear" aria-label="Limpar busca" @click="clear">✕</button>
    <ul v-if="visible" class="results" role="listbox">
      <li v-if="!results.length" class="empty">Nada encontrado para “{{ modelValue }}”.</li>
      <li v-for="(r, i) in results" :key="r.type + r.id" :class="{ on: i === active }"
        role="option" :aria-selected="i === active" @mousedown.prevent="choose(r)">
        <b>{{ r.name }}</b><small>{{ r.subtitle }}</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search { position: relative; flex: 1; max-width: 560px; }
.search input { background: var(--ink-2); border-color: #2c4560; color: #fff; padding-right: 32px; }
.search input::placeholder { color: #8ea1b6; }
.search input::-webkit-search-cancel-button { display: none; }
.clear { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); border: 0; background: transparent;
  color: #aab8c8; cursor: pointer; padding: 2px 6px; }
.clear:hover { color: #fff; }
.results { position: absolute; top: 40px; left: 0; right: 0; background: #fff; color: var(--ink); list-style: none; margin: 0; padding: 4px 0;
  border-radius: var(--radius); max-height: 60vh; overflow: auto; box-shadow: 0 8px 24px rgba(0,0,0,.3); z-index: 2000; }
.results li { padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; }
.results li:hover, .results li.on { background: #eef3f6; }
.results small, .empty { color: var(--muted); }
.empty { padding: 10px 12px; cursor: default; }
</style>
