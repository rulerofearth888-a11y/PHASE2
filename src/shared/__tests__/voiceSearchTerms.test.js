// Spoken Tamil/Hindi/Kannada/Telugu -> English catalogue search
// (src/shared/voiceSearchTerms.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spokenToCatalogQuery, catalogueVocabulary } from '../voiceSearchTerms.js';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
require('../../../public/js/lang-ta.js');
const TA = globalThis.window.SB_LANG_TA.text;

const VOCAB = catalogueVocabulary([
  ['Paddy/Rice', 'Wheat', 'Cotton', 'Tomato', 'Banana', 'Coconut', 'Potato'],
  ['Blast', 'Blight', 'Rust', 'Whitefly', 'Aphids', 'Thrips', 'Stem Borer', 'Weeds'],
  ['Fungicide', 'Insecticide', 'Bio-Stimulant', 'Herbicide', 'Nematicide', 'Fertilizer'],
]);
const q = (text, lang = 'ta', pack = TA) => spokenToCatalogQuery(text, lang, pack, VOCAB);

test('a Tamil crop and disease become the English catalogue words', () => {
  // The pack's own "Rice Blast" label wins; products list "Paddy/Rice", so it matches.
  assert.deepEqual(q('நெல் குலை நோய்'), { query: 'Rice Blast', understood: true });
  assert.equal(q('பருத்தி வெள்ளை ஈ').query, 'Cotton Whitefly');
});

test('spoken forms and glued suffixes are understood', () => {
  assert.equal(q('நெல்லுக்கு மருந்து வேண்டும்').query, 'Paddy');
  assert.equal(q('தக்காளியில் கருகல் நோய்').query, 'Tomato Blight');
  assert.equal(q('மிளகாய் இலைப்பேன்').query, 'Chilli Thrips');
});

test('longest phrase wins over its first word', () => {
  assert.equal(q('தண்டுத் துளைப்பான்').query, 'Stem Borer');
  assert.equal(q('பூஞ்சைக்கொல்லி').query, 'Fungicide');
  assert.equal(q('உருளைக்கிழங்கு').query, 'Potato');
});

test('product names said in English are kept', () => {
  assert.equal(q('Gold Gel வாழை').query, 'Banana Gold Gel');
});

test('page words from the pack ("Hello") are never search terms', () => {
  assert.equal(q('வணக்கம்').query, '');
});

test('nothing recognisable -> understood false, no Tamil left in the query', () => {
  const r = q('வணக்கம் எப்படி இருக்கீங்க');
  assert.equal(r.understood, false);
  assert.equal(r.query, '');
});

test('English pages and English speech pass through', () => {
  assert.deepEqual(q('paddy blast', 'en'), { query: 'paddy blast', understood: true });
  assert.deepEqual(q('whitefly', 'ta'), { query: 'whitefly', understood: true });
});

test('Hindi, Kannada and Telugu farmer words work without a pack', () => {
  assert.equal(q('धान के लिए दवा', 'hi', {}).query, 'Paddy');
  assert.equal(q('ಹತ್ತಿ ಬಿಳಿನೊಣ', 'kn', {}).query, 'Cotton Whitefly');
  assert.equal(q('వరి కలుపు', 'te', {}).query, 'Paddy Weeds');
});

test('Hindi, Kannada and Telugu pests, diseases and product forms', () => {
  assert.equal(q('टमाटर में फल छेदक की दवा', 'hi', {}).query, 'Tomato Fruit Borer');
  assert.equal(q('मिर्च चूर्णिल आसिता', 'hi', {}).query, 'Chilli Powdery Mildew');
  assert.equal(q('ಭತ್ತ ಬೆಂಕಿ ರೋಗ ಔಷಧಿ ಬೇಕು', 'kn', {}).query, 'Paddy Blast');
  assert.equal(q('ಬದನೆ ಕಾಯಿ ಕೊರಕ', 'kn', {}).query, 'Brinjal Fruit Borer');
  assert.equal(q('వరి అగ్గి తెగులు మందు కావాలి', 'te', {}).query, 'Paddy Blast');
  assert.equal(q('మిరప తామర పురుగు', 'te', {}).query, 'Chilli Thrips');
  assert.equal(q('పత్తి తెల్లదోమ', 'te', {}).query, 'Cotton Whitefly');
  assert.equal(q('ಶಿಲೀಂಧ್ರನಾಶಕ ಪುಡಿ', 'kn', {}).query, 'Fungicide Powder');
});

test('the Hindi, Kannada and Telugu packs add their crop and pest labels', () => {
  for (const code of ['hi', 'kn', 'te']) {
    require(`../../../public/js/lang-${code}.js`);
    const pack = globalThis.window[`SB_LANG_${code.toUpperCase()}`].text;
    const vocab = catalogueVocabulary([['Mango', 'Onion', 'Groundnut'], ['Nematode', 'Wilt']]);
    assert.equal(spokenToCatalogQuery(pack.Nematode, code, pack, vocab).query, 'Nematode', code);
    assert.equal(spokenToCatalogQuery(pack.Mango, code, pack, vocab).query, 'Mango', code);
  }
});
