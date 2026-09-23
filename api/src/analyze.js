// Claude vision pass: photo(s) -> structured item record.
import Anthropic from '@anthropic-ai/sdk';
import { CATEGORY_IDS } from './categories.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

const SYSTEM = `You are an appraiser's assistant cataloguing the contents of a house for an estate sale.
You look at photos of one item and produce a structured record that will be used to
(1) write a marketplace listing and (2) search eBay / Discogs / coin databases for comparable sales.

Be specific and literal. Read every label, logo, model number, serial number, catalog number,
mint mark, issue number, publisher, and date you can see. If something is not visible, leave it
blank rather than guessing. When you are inferring (e.g. decade from styling), say so in
the field and lower confidence.

Categories (pick exactly one id): ${CATEGORY_IDS.join(', ')}

Return ONLY a JSON object with this shape — no prose, no markdown fences:
{
  "title": "short listing-style title, <= 80 chars, brand/model/key detail first",
  "category": "<one of the category ids>",
  "subcategory": "more specific type, e.g. 'acoustic guitar', 'die-cast car', '1/72 plastic kit', 'underground comix'",
  "brand": "",
  "model": "",
  "year_made": "e.g. '1974' or 'c. 1960s (inferred from styling)'",
  "condition": "one of: Mint, Excellent, Good, Fair, Poor, Unknown",
  "condition_notes": "visible wear, damage, missing parts, completeness",
  "identifiers": { "serial": "", "catalog_number": "", "upc": "", "issue_number": "", "publisher": "", "mint_mark": "", "denomination": "", "other": "" },
  "attributes": { "color": "", "material": "", "dimensions_estimate": "", "quantity_in_photo": 1, "other": "" },
  "description": "2-4 sentence honest marketplace description. No hype. Mention flaws.",
  "search_queries": ["best eBay search string for comps", "an alternate shorter query"],
  "confidence": 0.0
}`;

/**
 * @param {Array<{data: string, media_type: string}>} images base64 images
 * @param {string} [hint] optional user-typed hint ("it's a Fender", "found in garage")
 */
export async function analyzeItem(images, hint) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY not set'), { status: 500 });
  }
  if (!images?.length) {
    throw Object.assign(new Error('At least one image is required'), { status: 400 });
  }

  const content = images.slice(0, 4).map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.media_type, data: img.data },
  }));
  content.push({
    type: 'text',
    text: hint
      ? `Catalogue this item. Owner's note: "${hint}"`
      : 'Catalogue this item.',
  });

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = safeParseJson(text);
  if (!parsed) {
    throw Object.assign(new Error('Model did not return JSON'), { status: 502, raw: text });
  }
  if (!CATEGORY_IDS.includes(parsed.category)) parsed.category = 'other';
  parsed.confidence = clamp(Number(parsed.confidence) || 0.5, 0, 1);
  return parsed;
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
