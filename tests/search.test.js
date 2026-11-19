import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchItems } from '../src/api.js'

const db = {
  cto: [
    { id: 1, name: 'CTO Centro', address: 'Rua A, 100', observation: 'Próxima à praça', latitude: -23.55, longitude: -46.63 },
    { id: 2, name: 'CTO Norte', address: 'Rua B, 200' },
  ],
  customer: [
    { id: 7, name: 'Cliente 7', address: 'Rua A, 110', phone: '(11) 90000-0000', latitude: -23.56, longitude: -46.64 },
  ],
}

test('searchItems: busca vazia não retorna resultados', () => {
  assert.deepEqual(searchItems(db, ''), [])
  assert.deepEqual(searchItems(db, '   '), [])
})

test('searchItems: busca ignorando maiúsculas em nome, endereço e observação', () => {
  assert.deepEqual(searchItems(db, 'rua a').map((r) => r.id), [1, 7])
  assert.equal(searchItems(db, 'PRAÇA').length, 1)
  assert.equal(searchItems(db, 'Centro')[0].name, 'CTO Centro')
})

test('searchItems: resultado traz tipo, legenda e coordenadas', () => {
  assert.deepEqual(searchItems(db, 'Centro'), [
    { type: 'cto', id: 1, name: 'CTO Centro', subtitle: 'CTO', lat: -23.55, lng: -46.63 },
  ])
})

test('searchItems: ignora campos não indexados', () => {
  assert.deepEqual(searchItems(db, '90000'), [])
})

test('searchItems: limita a 30 resultados', () => {
  const many = { customer: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Cliente ${i + 1}` })) }
  assert.equal(searchItems(many, 'cliente').length, 30)
})
