const express = require('express');
const https = require('https');
const db = require('../db');
const router = express.Router();

// In-memory cache to avoid hammering external APIs
const cache = {};
const TTL = { quotes: 30_000, calendar: 3_600_000 };

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
        catch (e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject);
  });
}

const TICKERS = [
  { symbol: 'NQ=F',    label: 'NQ',  name: 'E-mini NASDAQ' },
  { symbol: 'MNQ=F',   label: 'MNQ', name: 'Micro NASDAQ'  },
  { symbol: 'ES=F',    label: 'ES',  name: 'E-mini S&P 500' },
  { symbol: 'GC=F',    label: 'GC',  name: 'Gold Futures'  },
  { symbol: 'BTC-USD', label: 'BTC', name: 'Bitcoin'       },
];

router.get('/quotes', async (req, res) => {
  const now = Date.now();
  if (cache.quotes && now - cache.quotesAt < TTL.quotes) return res.json(cache.quotes);

  try {
    const syms = TICKERS.map(t => t.symbol).join(',');
    const fields = [
      'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
      'regularMarketPreviousClose', 'regularMarketTime', 'regularMarketDayHigh',
      'regularMarketDayLow', 'regularMarketVolume',
    ].join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=${fields}`;
    const data = await fetchJson(url);
    const results = data?.quoteResponse?.result || [];

    const quotes = TICKERS.map(({ symbol, label, name }) => {
      const q = results.find(r => r.symbol === symbol) || {};
      return {
        symbol, label, name,
        price:         q.regularMarketPrice         ?? null,
        change:        q.regularMarketChange        ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        prevClose:     q.regularMarketPreviousClose ?? null,
        dayHigh:       q.regularMarketDayHigh       ?? null,
        dayLow:        q.regularMarketDayLow        ?? null,
        updatedAt:     q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null,
      };
    });

    cache.quotes = quotes;
    cache.quotesAt = now;
    res.json(quotes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calendar', async (req, res) => {
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value])
  );
  const apiKey = settings.finnhub_api_key;
  if (!apiKey) return res.json({ events: [], noKey: true });

  const now = Date.now();
  if (cache.calendar && now - cache.calendarAt < TTL.calendar) return res.json(cache.calendar);

  // Mon–Sun of current week
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
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

// Bust calendar cache (called after API key is saved in settings)
router.post('/calendar/refresh', (req, res) => {
  cache.calendar = null;
  cache.calendar = null;
  res.json({ ok: true });
});

module.exports = router;
