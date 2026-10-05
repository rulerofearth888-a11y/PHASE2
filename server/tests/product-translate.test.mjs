// Machine translation of product text (server/productTranslate.js) with a fake
// translator: nothing is sent to Google. Run from server/: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  protect, unprotect, numbersIn, sameNumbers, fieldsToTranslate, translateProduct,
  applyCorrection, createProductTranslator, googleTranslator, sourceHash, TRANSLATED_LANGS,
} from '../productTranslate.js';

// "Translates" by tagging the text with the language; keeps protected spans.
const fake = calls => async (texts, lang) => {
  calls?.push({ lang, texts });
  return texts.map(t => `[${lang}] ${t}`);
};

const gel = () => ({
  id: 'p1', name: 'Gold Gel',
  tagline: 'Organic soil conditioner',
  description: 'Gold Gel improves root growth.',
  dosage: '10 kg per acre',
  howToUse: '', whenToUse: 'At sowing',
});

test('numbers must match exactly', () => {
  assert.deepEqual(numbersIn('Use 2.5 ml/L, 10 kg or 1,000 g'), ['10', '1000', '2.5']);
  assert.ok(sameNumbers('10 kg per acre', 'ஏக்கருக்கு 10 kg'));
  assert.ok(!sameNumbers('10 kg per acre', 'ஏக்கருக்கு 100 kg'));
  assert.ok(!sameNumbers('10 kg per acre', 'ஏக்கருக்கு kg'));
});

test('product name, brand words and amounts are marked do-not-translate', () => {
  const html = protect('Gold Gel at 10 kg per acre via WhatsApp & 20% off', 'Gold Gel');
  assert.match(html, /<span class="notranslate">Gold Gel<\/span>/);
  assert.match(html, /<span class="notranslate">10 kg<\/span>/);
  assert.match(html, /<span class="notranslate">WhatsApp<\/span>/);
  assert.match(html, /<span class="notranslate">20%<\/span>/);
  assert.match(html, /&amp;/);
  assert.equal(unprotect(html), 'Gold Gel at 10 kg per acre via WhatsApp & 20% off');
  assert.equal(unprotect('a<br>b &#39;c&#39; &quot;d&quot;'), "a\nb 'c' \"d\"");
});

test('a new product gets every filled field in all four languages', async () => {
  const p = gel();
  const calls = [];
  const i18n = await translateProduct(p, fake(calls));
  assert.equal(calls.length, 4);
  for (const lang of TRANSLATED_LANGS) {
    assert.equal(i18n[lang].dosage, `[${lang}] 10 kg per acre`);
    assert.equal(i18n[lang].description, `[${lang}] Gold Gel improves root growth.`);
    assert.equal(i18n[lang].howToUse, undefined);
  }
  assert.equal(i18n.src.dosage, sourceHash('10 kg per acre'));
});

test('nothing changed -> nothing sent; one field changed -> only that one', async () => {
  const p = gel();
  p.i18n = await translateProduct(p, fake());
  assert.deepEqual(fieldsToTranslate(p), {});
  assert.equal(await translateProduct(p, fake()), null);

  p.dosage = '12 kg per acre';
  const calls = [];
  const next = await translateProduct(p, fake(calls));
  assert.deepEqual(calls.map(c => c.texts.length), [1, 1, 1, 1]);
  assert.equal(next.ta.dosage, '[ta] 12 kg per acre');
  assert.equal(next.ta.tagline, '[ta] Organic soil conditioner');
});

test('a translation that changes a number is dropped (English is shown)', async () => {
  const p = gel();
  const wrong = async (texts, lang) => texts.map(t => (lang === 'hi' ? t.replace('10', '100') : t));
  const i18n = await translateProduct(p, wrong);
  assert.equal(i18n.hi.dosage, undefined);
  assert.ok(i18n.hi.description);
  assert.equal(i18n.failed.hi.dosage, true);
  assert.ok(i18n.ta.dosage);
  // Not retried while the English is the same...
  p.i18n = i18n;
  assert.deepEqual(fieldsToTranslate(p), {});
  // ...but retried once it changes.
  p.dosage = '11 kg per acre';
  assert.deepEqual(Object.keys(fieldsToTranslate(p)), ['dosage']);
});

test('staff corrections are kept until the English changes', async () => {
  const p = gel();
  p.i18n = await translateProduct(p, fake());
  p.i18n = applyCorrection(p, 'ta', 'dosage', 'ஏக்கருக்கு 10 கிலோ');
  assert.equal(p.i18n.locked.ta.dosage, true);

  p.description = 'Gold Gel improves root and shoot growth.';
  let next = await translateProduct(p, fake());
  assert.equal(next.ta.dosage, 'ஏக்கருக்கு 10 கிலோ');
  p.i18n = next;

  p.dosage = '15 kg per acre';
  next = await translateProduct(p, fake());
  assert.equal(next.ta.dosage, '[ta] 15 kg per acre');
  assert.equal(next.locked.ta.dosage, undefined);
});

test('clearing a correction lets the machine translate it again', async () => {
  const p = gel();
  p.i18n = await translateProduct(p, fake());
  p.i18n = applyCorrection(p, 'kn', 'tagline', 'ಸರಿಪಡಿಸಿದ ಪಠ್ಯ');
  p.i18n = applyCorrection(p, 'kn', 'tagline', '');
  assert.deepEqual(Object.keys(fieldsToTranslate(p)), ['tagline']);
  assert.throws(() => applyCorrection(p, 'fr', 'tagline', 'x'));
  assert.throws(() => applyCorrection(p, 'ta', 'price', 'x'));
});

test('a field emptied in English loses its translations', async () => {
  const p = gel();
  p.i18n = await translateProduct(p, fake());
  p.whenToUse = '';
  p.tagline = 'Organic soil conditioner, now bigger';
  const next = await translateProduct(p, fake());
  assert.equal(next.ta.whenToUse, undefined);
  assert.equal(next.src.whenToUse, undefined);
});

test('long text is sent in several requests', async () => {
  const p = { ...gel(), description: 'Long text. '.repeat(500), detailedDescription: 'More text. '.repeat(500) };
  const calls = [];
  await translateProduct(p, fake(calls));
  assert.ok(calls.filter(c => c.lang === 'ta').length >= 2);
  for (const c of calls) assert.ok(c.texts.join('').length <= 4500 || c.texts.length === 1);
});

test('the runner: off without a key, translates queued products, writes only i18n', async () => {
  const store = { p1: gel() };
  const writes = [];
  const db = {
    getProductById: async id => store[id],
    getAllProductsRaw: async () => Object.values(store),
    setProductI18n: async (id, i18n) => { writes.push(id); store[id] = { ...store[id], i18n }; },
  };
  const quiet = { log() {}, warn() {} };
  const off = createProductTranslator({ db, apiKey: '', log: quiet });
  assert.equal(off.enabled, false);
  assert.equal(await off.sweep(), 0);

  const on = createProductTranslator({ db, translate: fake(), log: quiet });
  assert.equal(await on.sweep(), 1);
  assert.deepEqual(writes, ['p1']);
  assert.equal(await on.sweep(), 0);

  const broken = createProductTranslator({ db: { ...db, getProductById: async () => ({ ...gel(), dosage: '9 kg' }) }, translate: async () => { throw new Error('quota'); }, log: quiet });
  await broken.translateOne('p1').then(() => assert.fail('should throw'), err => assert.match(err.message, /quota/));
});

test('the Google request: html format, English source, key in the URL, errors surfaced', async () => {
  let seen;
  const ok = googleTranslator('KEY', async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ data: { translations: [{ translatedText: 'வணக்கம்' }] } }) };
  });
  assert.deepEqual(await ok(['Hello'], 'ta'), ['வணக்கம்']);
  assert.match(seen.url, /language\/translate\/v2\?key=KEY$/);
  assert.deepEqual(seen.body, { q: ['Hello'], source: 'en', target: 'ta', format: 'html' });

  const bad = googleTranslator('KEY', async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API key not valid' } }) }));
  await assert.rejects(bad(['x'], 'ta'), /403: API key not valid/);
});
