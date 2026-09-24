// PCGS Public API — price guide + auction prices realized.
// Register (free) at https://www.pcgs.com/publicapi → access token.
// Daily call limit is low, so every lookup is cached in Supabase (see cache.js):
// price guide / coin facts for 7 days, auction results for 30 days.

import { cached } from './cache.js';

const BASE = 'https://api.pcgs.com/publicapi';
const TTL_FACTS = 7 * 24 * 60 * 60 * 1000;
const TTL_APR   = 30 * 24 * 60 * 60 * 1000;

export function pcgsConfigured() {
  return Boolean(process.env.PCGS_TOKEN);
}

async function get(path, params = {}, ttl = TTL_FACTS) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  return cached(`pcgs:${url}`, ttl, async () => {
    const res = await fetch(url, {
      headers: { Authorization: `bearer ${process.env.PCGS_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) throw new Error('PCGS daily call limit reached');
    if (!res.ok) throw new Error(`PCGS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    if (json?.IsValidRequest === false) throw new Error(`PCGS: ${json.ServerMessage || 'invalid request'}`);
    return json;
  });
}

const num = v => { const n = Number(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

function normalizeFacts(f) {
  if (!f) return null;
  return {
    pcgs_number: f.PCGSNo ?? null,
    cert_number: f.CertNo ?? null,
    name: f.Name ?? null,
    year: f.Year ?? null,
    denomination: f.Denomination ?? null,
    mint_mark: f.MintMark ?? null,
    grade: f.Grade ?? null,
    designation: f.Designation ?? null,
    price_guide: num(f.PriceGuideValue),
    population: f.Population ?? null,
    pop_higher: f.PopHigher ?? null,
    mintage: f.MintageCount ?? f.Mintage ?? null,
    url: f.PCGSNo ? `https://www.pcgs.com/coinfacts/coin/${f.PCGSNo}` : null,
  };
}

/** Slabbed PCGS coin: exact price guide value for that cert. */
export async function pcgsByCert(certNo) {
  const c = String(certNo || '').replace(/\D/g, '');
  if (c.length < 7) throw new Error('PCGS cert numbers are 7–8 digits');
  const json = await get(`/coindetail/GetCoinFactsByCertNo/${c}`);
  return normalizeFacts(json);
}

/** Raw coin: price guide at a given Sheldon grade (1–70). */
export async function pcgsByGrade(pcgsNo, gradeNo, plus = false) {
  const json = await get('/coindetail/GetCoinFactsByGrade', {
    PCGSNo: String(pcgsNo), GradeNo: String(gradeNo), PlusGrade: String(plus),
  });
  return normalizeFacts(json);
}

function normalizeAuctions(json) {
  const list = json?.Auctions || json?.AuctionList || json?.APR || [];
  return list.map(a => ({
    source: 'pcgs_apr',
    title: [a.Name || a.CoinName, a.Grade || a.GradeName].filter(Boolean).join(' '),
    price: num(a.PriceRealized ?? a.Price ?? a.SalePrice),
    currency: 'USD',
    date: a.SaleDate || a.AuctionDate || a.Date || null,
    house: a.AuctionHouse || a.Auctioneer || null,
    lot: a.LotNumber ?? null,
    url: a.Url || a.URL || a.Link || null,
    image: null,
  })).filter(a => a.price);
}

/** Auction prices realized for a cert (slabbed) or PCGS# + grade (raw). */
export async function pcgsAprByCert(certNo) {
  const c = String(certNo || '').replace(/\D/g, '');
  return normalizeAuctions(await get(`/coindetail/GetAPRByCertNo/${c}`, {}, TTL_APR));
}
export async function pcgsAprByGrade(pcgsNo, gradeNo, { records = 15 } = {}) {
  return normalizeAuctions(await get('/coindetail/GetAPRByGrade', {
    PCGSNo: String(pcgsNo), GradeNo: String(gradeNo), PlusGrade: 'false', NumberOfRecords: String(records),
  }, TTL_APR));
}

/**
 * Sanity check that what PCGS returned is the coin the AI saw. Year must
 * match; mint mark must match when both are present. Denomination is checked
 * loosely (first word) because PCGS spells them many ways.
 */
export function factsMatchCoin(facts, coin) {
  if (!facts || !coin) return false;
  const y = String(coin.year || '').trim();
  if (y && String(facts.year || '').trim() !== y) return false;
  const mm = String(coin.mint_mark || '').toUpperCase().replace(/^(NONE|P)$/, '');
  const fm = String(facts.mint_mark || '').toUpperCase().replace(/^(NONE|P)$/, '');
  if (mm && fm && mm !== fm) return false;
  const d = String(coin.denomination || '').toLowerCase().split(/\s+/)[0];
  const fd = String(facts.denomination || facts.name || '').toLowerCase();
  if (d && d.length > 2 && !fd.includes(d) && !synonyms(d).some(s => fd.includes(s))) return false;
  return true;
}
function synonyms(d) {
  return ({
    cent: ['1c', 'penny', 'cent'], penny: ['1c', 'cent'], nickel: ['5c'], dime: ['10c'],
    quarter: ['25c'], half: ['50c'], dollar: ['$1', 's$1', 'dollar'], silver: ['$1', 'dollar'],
  })[d] || [];
}
