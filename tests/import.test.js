import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDb } from '../src/api.js'
import { pathLengthM } from '../src/data.js'

test('normalizeDb: preenche listas ausentes com arrays vazios', () => {
  const db = normalizeDb({})
  assert.equal(Object.keys(db).length, 7)
  for (const list of Object.values(db)) assert.deepEqual(list, [])
})

test('normalizeDb: recalcula o comprimento dos cabos pelo traçado', () => {
  const path = [[0, 0], [0, 1]]
  const db = normalizeDb({ cable: [{ id: 1, name: 'Cabo', length_m: 999, path }] })
  assert.equal(db.cable[0].length_m, Math.round(pathLengthM(path)))
  assert.equal(normalizeDb({ cable: [{}] }).cable[0].length_m, 0)
})

test('normalizeDb: não altera o objeto recebido', () => {
  const input = { cto: [{ id: 1, name: 'CTO 1' }] }
  const db = normalizeDb(input)
  db.cto[0].name = 'CTO 2'
  assert.equal(input.cto[0].name, 'CTO 1')
})

test('normalizeDb: rejeita entradas inválidas', () => {
  assert.throws(() => normalizeDb(null), /esperado um objeto JSON/)
  assert.throws(() => normalizeDb([]), /esperado um objeto JSON/)
  assert.throws(() => normalizeDb({ cto: {} }), /deve ser uma lista/)
})
