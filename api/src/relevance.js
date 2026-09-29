// Comp relevance: marketplace searches return components, accessories and
// junk alongside the real thing. Tag each comp as match / partial / unrelated
// so only true matches drive the price statistics.
//
//   1. Keyword pre-filter (free): obvious non-items like "COA only".
//   2. One cheap Claude call (Haiku) classifies the rest against the item.
//      If it fails, everything not caught by step 1 is treated as a match.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID }
    : {},
});
const MODEL = process.env.ANTHROPIC_COMP_MODEL || 'claude-haiku-4-5';

const JUNK = [
  /\bcoa only\b/i, /\bno coins?\b/i, /\bbox only\b/i, /\bempty (box|case|holder)\b/i,
  /\b(case|holder|capsule|sleeve|packaging|insert|ogp) only\b/i, /\bcertificate only\b/i,
  /\breplacement (box|case)\b/i, /\bdisplay (case|stand) only\b/i, /\bfor parts\b/i,
];

export function keywordJunk(title) {
  return JUNK.some(re => re.test(title || ''));
}

/**
 * @param {object} item   { title, category, description?, coin?, instrument? }
 * @param {Array}  comps  each has .title; mutated to add .relevance and .why
 * @returns {Promise<{matches: Array, partial: Array, unrelated: Array, method: string}>}
 */
export async function classifyComps(item, comps) {
  for (const c of comps) {
    if (keywordJunk(c.title)) { c.relevance = 'unrelated'; c.why = 'accessory/packaging only'; }
  }
  const pending = comps.filter(c => !c.relevance);
  let method = 'keywords';

  if (pending.length && process.env.ANTHROPIC_API_KEY) {
    try {
      const lines = pending.map((c, i) => `${i}: ${String(c.title).slice(0, 140)}${c.price ? ` — $${c.price}` : ''}`).join('\n');
      const what = [
        `ITEM: ${item.title}`,
        item.coin?.count > 1
          ? `This is a LOT/SET of ${item.coin.count} pieces. A listing must explicitly indicate ${item.coin.count} pieces / a set to be a match; otherwise it is "partial".`
          : (Number(item.quantity) > 1 ? `This is a LOT of ${item.quantity} pieces sold together.` : ''),
        item.coin?.product_type ? `Coin product type: ${item.coin.product_type}.` : '',
        item.instrument?.type ? `Instrument type: ${item.instrument.type}.` : '',
        item.description ? `Description: ${String(item.description).slice(0, 400)}` : '',
      ].filter(Boolean).join('\n');

      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 800,
        system: `You judge whether marketplace listings are comparable sales for a specific item.
Return ONLY a JSON array, one entry per listing index, like [{"i":0,"r":"match"},{"i":1,"r":"partial"},...].
r must be one of:
- "match": the same item, complete, in comparable form (same set/lot size, same product; grade/condition may differ).
- "partial": a component or subset (one coin from a multi-coin set, a body without the case, a single volume of a run) or a larger bundle that contains it.
- "unrelated": a different item, a different year/variant, an accessory, packaging, a reproduction, or a lot of many unrelated things.
Be strict about set size: a single coin is "partial" for a 3-coin set, not a match.
When the ITEM is a lot/set of N pieces, a listing is a "match" ONLY if its title explicitly signals multiple pieces (words like "set", "N coin", "N-piece", "lot of N", "complete", "all three"). Sellers often title a single coin with the program's full name ("2014 Baseball Hall of Fame Commemorative Coin Program"); with no explicit multi-piece signal, assume it is ONE piece and return "partial". Price is a useful tiebreaker: a listing priced like one coin is one coin.`,
        messages: [{ role: 'user', content: `${what}\n\nLISTINGS:\n${lines}` }],
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const m = text.match(/\[[\s\S]*\]/);
      const arr = m ? JSON.parse(m[0]) : [];
      for (const { i, r } of arr) {
        const c = pending[Number(i)];
        if (c && ['match', 'partial', 'unrelated'].includes(r)) c.relevance = r;
      }
      method = 'ai';
    } catch (e) {
      console.warn('comp classification failed:', e.message);
    }
  }
  for (const c of comps) if (!c.relevance) c.relevance = 'match';

  return {
    matches: comps.filter(c => c.relevance === 'match'),
    partial: comps.filter(c => c.relevance === 'partial'),
    unrelated: comps.filter(c => c.relevance === 'unrelated'),
    method,
  };
}
