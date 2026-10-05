// The store shows a product's translation when it has one (src/shared/productText.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productText } from '../productText.js'

const p = { dosage: '10 kg per acre', tagline: 'Organic', i18n: { ta: { dosage: 'ஏக்கருக்கு 10 kg', tagline: '  ' } } }

test('translated text in the chosen language, English otherwise', () => {
  assert.equal(productText(p, 'dosage', 'ta'), 'ஏக்கருக்கு 10 kg')
  assert.equal(productText(p, 'dosage', 'en'), '10 kg per acre')
  assert.equal(productText(p, 'dosage', 'hi'), '10 kg per acre')
  assert.equal(productText(p, 'tagline', 'ta'), 'Organic')
  assert.equal(productText(p, 'howToUse', 'ta'), '')
  assert.equal(productText(null, 'dosage', 'ta'), '')
  assert.equal(productText({ dosage: 'x' }, 'dosage', 'kn'), 'x')
})
