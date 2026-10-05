/**
 * One-time catch-up: machine-translates every product that has no Tamil,
 * Kannada, Telugu or Hindi text yet (or whose English changed). New and edited
 * products are translated by the server on their own; this is for the
 * products that existed before that, or after the key was first added.
 *
 *   node server/scripts/translate-products.mjs                       (dry run: lists what it would translate, sends nothing)
 *   node server/scripts/translate-products.mjs --db=sathyambio --yes (translates and saves)
 *
 * Needs GOOGLE_TRANSLATE_API_KEY and MONGODB_URI (server/.env). Writes only
 * each product's `i18n` field. Prints the database name first; --yes needs
 * --db=<name> to match it, so a stale .env cannot be written to by accident.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { fieldsToTranslate, translateProduct, googleTranslator, TRANSLATED_LANGS } from '../productTranslate.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--yes');
const expectDb = (args.find(a => a.startsWith('--db=')) || '').split('=')[1] || '';
const uri = process.env.MONGODB_URI;
const key = process.env.GOOGLE_TRANSLATE_API_KEY;

if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
if (APPLY && !key) { console.error('GOOGLE_TRANSLATE_API_KEY is not set.'); process.exit(1); }

await mongoose.connect(uri, { bufferCommands: false });
const conn = mongoose.connection;
console.log(`database: ${conn.name}`);
if (expectDb && conn.name !== expectDb) {
  console.error(`ABORT: expected ${expectDb}, connected to ${conn.name}. Nothing written.`);
  await mongoose.disconnect(); process.exit(1);
}
if (APPLY && !expectDb) {
  console.error('ABORT: applying needs --db=<name>.');
  await mongoose.disconnect(); process.exit(1);
}

const products = conn.collection('products');
const docs = await products.find({}).toArray();
const due = docs.map(d => ({ ...d, id: String(d._id) })).filter(p => Object.keys(fieldsToTranslate(p)).length);
const chars = due.reduce((n, p) => n + Object.values(fieldsToTranslate(p)).join('').length, 0) * TRANSLATED_LANGS.length;
console.log(`${docs.length} products, ${due.length} need translating, about ${chars.toLocaleString('en-IN')} characters (free tier: 500,000 a month)`);
for (const p of due) console.log(`  ${p.id}  ${p.name}  [${Object.keys(fieldsToTranslate(p)).join(', ')}]`);

if (!APPLY) {
  console.log('Dry run: nothing sent, nothing written. Add --db=<name> --yes to translate.');
  await mongoose.disconnect(); process.exit(0);
}

const translate = googleTranslator(key);
let done = 0;
for (const p of due) {
  try {
    const i18n = await translateProduct(p, translate);
    if (i18n) await products.updateOne({ _id: p._id }, { $set: { i18n } });
    const kept = Object.entries(i18n?.failed || {}).map(([l, f]) => `${l}:${Object.keys(f).join('/')}`).join(' ');
    console.log(`  ✓ ${p.name}${kept ? `  (kept in English, numbers changed: ${kept})` : ''}`);
    done += 1;
  } catch (err) {
    console.error(`  ✗ ${p.name}: ${err.message}`);
    if (/40[13]/.test(err.message)) break; // bad key or API not enabled: stop
  }
}
console.log(`${done}/${due.length} translated. The live site picks them up within a minute (product cache).`);
await mongoose.disconnect();
