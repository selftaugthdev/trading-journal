const express = require('express');
const https = require('https');
const db = require('../db');
const router = express.Router();

const cache = {};
const TTL = { quotes: 30_000, calendar: 3_600_000 };

// Stooq live quote (CSV) — works without auth, no rate limits
async function fetchStooq(stooqSymbol) {
  const url = `https://stooq.com/q/l/?s=${stooqSymbol}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/csv,text/plain' },
  });
  const text = await r.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const [, date, time, open, high, low, close] = lines[1].split(',');
  if (close === 'N/D') return null;
  const price     = parseFloat(close);
  const openPrice = parseFloat(open);
  const change        = +(price - openPrice).toFixed(2);
  const changePercent = +((price - openPrice) / openPrice * 100).toFixed(4);
  return {
    price, change, changePercent,
    prevClose: openPrice,
    dayHigh: parseFloat(high), dayLow: parseFloat(low),
    updatedAt: date && time ? new Date(`${date}T${time}`).toISOString() : null,
  };
}

// CoinGecko for BTC — free, no auth, includes 24h change
async function fetchBTC() {
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } },
  );
  const d = await r.json();
  const price         = d?.bitcoin?.usd ?? null;
  const changePercent = d?.bitcoin?.usd_24h_change ?? null;
  const change        = price != null && changePercent != null
    ? +(price / (1 + changePercent / 100) * (changePercent / 100)).toFixed(2)
    : null;
  return { price, change, changePercent: changePercent ? +changePercent.toFixed(4) : null, prevClose: null };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json',
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject);
  });
}

const TICKERS = [
  { label: 'NQ',  name: 'E-mini NASDAQ',  stooq: 'nq.f'  },
  { label: 'CL',  name: 'Crude Oil',      stooq: 'cl.f'  },
  { label: 'ES',  name: 'E-mini S&P 500', stooq: 'es.f'  },
  { label: 'GC',  name: 'Gold Futures',   stooq: 'gc.f'  },
  { label: 'BTC', name: 'Bitcoin',        stooq: null    },
];

router.get('/quotes', async (_req, res) => {
  const now = Date.now();
  if (cache.quotes && now - cache.quotesAt < TTL.quotes) return res.json(cache.quotes);

  try {
    const results = await Promise.all(
      TICKERS.map(async ({ label, name, stooq }) => {
        try {
          const q = stooq ? await fetchStooq(stooq) : await fetchBTC();
          return { label, name, ...(q || { price: null, change: null, changePercent: null, prevClose: null }) };
        } catch {
          return { label, name, price: null, change: null, changePercent: null, prevClose: null };
        }
      })
    );

    cache.quotes = results;
    cache.quotesAt = now;
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calendar', async (_req, res) => {
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value])
  );
  const apiKey = settings.finnhub_api_key;
  if (!apiKey) return res.json({ events: [], noKey: true });

  const now = Date.now();
  if (cache.calendar && now - cache.calendarAt < TTL.calendar) return res.json(cache.calendar);

  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const from = mon.toISOString().slice(0, 10);
  const to   = sun.toISOString().slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;
    const data = await fetchJson(url);
    const events = (data?.economicCalendar || [])
      .filter(e => e.country === 'US')
      .sort((a, b) => new Date(a.time) - new Date(b.time));
    const result = { events, from, to };
    cache.calendar = result;
    cache.calendarAt = now;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/calendar/refresh', (_req, res) => {
  cache.calendar = null;
  res.json({ ok: true });
});

module.exports = router;
