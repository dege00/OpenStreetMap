import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanceM, pathLengthM } from '../src/data.js'

test('distanceM: mesmo ponto retorna 0', () => {
  assert.equal(distanceM([-23.55, -46.63], [-23.55, -46.63]), 0)
})

test('distanceM: 1 grau de latitude equivale a ~111 km', () => {
  const d = distanceM([0, 0], [1, 0])
  assert.ok(d > 110000 && d < 112000, `distancia inesperada: ${d}`)
})

test('pathLengthM: soma os segmentos do caminho', () => {
  const d = pathLengthM([[0, 0], [0, 0], [1, 0]])
  assert.ok(d > 110000 && d < 112000, `distancia inesperada: ${d}`)
})

test('pathLengthM: caminho vazio ou com 1 ponto retorna 0', () => {
  assert.equal(pathLengthM([]), 0)
  assert.equal(pathLengthM([[0, 0]]), 0)
})
