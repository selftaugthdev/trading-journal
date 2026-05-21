const express = require('express');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const { getSettings, calcGrossPnL, calcCommission, calcRMultiple, determineSession } = require('../utils');
const router = express.Router();

function enrichTrade(body, settings) {
  const { instrument, direction, entry_price, exit_price, contracts,
    planned_sl_ticks, commission: manualCommission, gross_pnl: providedGross } = body;

  const c = parseInt(contracts) || 1;
  const ep = parseFloat(entry_price);
  const xp = parseFloat(exit_price);
  const hasPrices = !isNaN(ep) && !isNaN(xp) && ep !== 0 && xp !== 0;

  let gross_pnl;
  if (hasPrices) {
    gross_pnl = calcGrossPnL(instrument, direction, ep, xp, c);
  } else if (providedGross != null && providedGross !== '' && !isNaN(parseFloat(providedGross))) {
    gross_pnl = parseFloat(providedGross);
  } else {
    gross_pnl = 0;
  }

  const commission = manualCommission != null && manualCommission !== ''
    ? parseFloat(manualCommission)
    : calcCommission(instrument, c, settings);
  const net_pnl = +(gross_pnl - commission).toFixed(2);
  const r_multiple = calcRMultiple(net_pnl, parseInt(planned_sl_ticks) || 0, instrument, c, settings);
  const session = body.session || determineSession(body.date_time);

  return { gross_pnl, commission, net_pnl, r_multiple, session };
}

function hydrateTrade(trade) {
  if (!trade) return null;
  const confluenceTags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN trade_tags tt ON tt.tag_id = t.id
    WHERE tt.trade_id = ? AND tt.tag_role = 'confluence'
  `).all(trade.id);
  const mistakeTags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN trade_tags tt ON tt.tag_id = t.id
    WHERE tt.trade_id = ? AND tt.tag_role = 'mistake'
  `).all(trade.id);
  const account = trade.account_id
    ? db.prepare('SELECT * FROM accounts WHERE id = ?').get(trade.account_id)
    : null;
  const setupTag = trade.setup_tag_id
    ? db.prepare('SELECT * FROM tags WHERE id = ?').get(trade.setup_tag_id)
    : null;
  return { ...trade, confluenceTags, mistakeTags, account, setupTag };
}

function applyTradeTags(tradeId, tagIds, role) {
  db.prepare('DELETE FROM trade_tags WHERE trade_id = ? AND tag_role = ?').run(tradeId, role);
  const ins = db.prepare('INSERT OR IGNORE INTO trade_tags (trade_id, tag_id, tag_role) VALUES (?, ?, ?)');
  for (const id of (tagIds || [])) ins.run(tradeId, id, role);
}

router.get('/', (req, res) => {
  const { start, end, account_id, instrument, direction, setup_tag_id, session, rating, sort, order } = req.query;

  let sql = 'SELECT * FROM trades WHERE 1=1';
  const params = [];

  if (start) { sql += ' AND date_time >= ?'; params.push(start); }
  if (end) { sql += ' AND date_time <= ?'; params.push(end + 'T23:59:59'); }
  if (account_id) { sql += ' AND account_id = ?'; params.push(account_id); }
  if (instrument) { sql += ' AND instrument = ?'; params.push(instrument); }
  if (direction) { sql += ' AND direction = ?'; params.push(direction); }
  if (setup_tag_id) { sql += ' AND setup_tag_id = ?'; params.push(setup_tag_id); }
  if (session) { sql += ' AND session = ?'; params.push(session); }
  if (rating) { sql += ' AND rating = ?'; params.push(rating); }

  const validSorts = ['date_time','instrument','direction','entry_price','exit_price','contracts',
    'gross_pnl','net_pnl','r_multiple','rating','session','commission'];
  const sortCol = validSorts.includes(sort) ? sort : 'date_time';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortCol} ${sortDir}`;

  const trades = db.prepare(sql).all(...params).map(hydrateTrade);
  res.json(trades);
});

router.get('/export', (req, res) => {
  const trades = db.prepare('SELECT * FROM trades ORDER BY date_time DESC').all().map(hydrateTrade);
  const rows = trades.map(t => ({
    date_time: t.date_time,
    instrument: t.instrument,
    account: t.account?.name ?? '',
    direction: t.direction,
    entry_price: t.entry_price,
    exit_price: t.exit_price,
    contracts: t.contracts,
    commission: t.commission,
    gross_pnl: t.gross_pnl,
    net_pnl: t.net_pnl,
    setup: t.setupTag?.name ?? '',
    confluence: t.confluenceTags.map(x => x.name).join(';'),
    planned_sl_ticks: t.planned_sl_ticks,
    planned_tp_ticks: t.planned_tp_ticks,
    actual_sl_hit: t.actual_sl_hit ? 'Yes' : 'No',
    r_multiple: t.r_multiple,
    rating: t.rating,
    mistakes: t.mistakeTags.map(x => x.name).join(';'),
    session: t.session,
    notes: t.notes,
    screenshot: t.screenshot,
  }));
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
  res.send(csv);
});

router.get('/:id', (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Not found' });
  res.json(hydrateTrade(trade));
});

router.post('/', (req, res) => {
  const settings = getSettings(db);
  const enriched = enrichTrade(req.body, settings);

  const { date_time, instrument, account_id, direction, entry_price, exit_price,
    contracts, setup_tag_id, planned_sl_ticks, planned_tp_ticks, actual_sl_hit,
    rating, notes, screenshot, confluence_tag_ids, mistake_tag_ids } = req.body;

  const info = db.prepare(`
    INSERT INTO trades (date_time, instrument, account_id, direction, entry_price, exit_price,
      contracts, commission, gross_pnl, net_pnl, setup_tag_id, planned_sl_ticks, planned_tp_ticks,
      actual_sl_hit, r_multiple, rating, notes, screenshot, session)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date_time, instrument, account_id || null, direction,
    parseFloat(entry_price) || 0, parseFloat(exit_price) || 0, parseInt(contracts) || 1,
    enriched.commission, enriched.gross_pnl, enriched.net_pnl,
    setup_tag_id || null, parseInt(planned_sl_ticks) || null, parseInt(planned_tp_ticks) || null,
    actual_sl_hit ? 1 : 0, enriched.r_multiple, rating || null, notes || null,
    screenshot || null, enriched.session
  );

  applyTradeTags(info.lastInsertRowid, confluence_tag_ids, 'confluence');
  applyTradeTags(info.lastInsertRowid, mistake_tag_ids, 'mistake');

  res.json(hydrateTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const settings = getSettings(db);
  const merged = { ...existing, ...req.body };
  const enriched = enrichTrade(merged, settings);

  const { date_time, instrument, account_id, direction, entry_price, exit_price,
    contracts, setup_tag_id, planned_sl_ticks, planned_tp_ticks, actual_sl_hit,
    rating, notes, screenshot, confluence_tag_ids, mistake_tag_ids } = merged;

  // Allow manual commission override
  const commission = req.body.commission != null ? parseFloat(req.body.commission) : enriched.commission;
  const net_pnl = +(enriched.gross_pnl - commission).toFixed(2);

  db.prepare(`
    UPDATE trades SET
      date_time=?, instrument=?, account_id=?, direction=?, entry_price=?, exit_price=?,
      contracts=?, commission=?, gross_pnl=?, net_pnl=?, setup_tag_id=?, planned_sl_ticks=?,
      planned_tp_ticks=?, actual_sl_hit=?, r_multiple=?, rating=?, notes=?, screenshot=?,
      session=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    date_time, instrument, account_id || null, direction,
    parseFloat(entry_price) || 0, parseFloat(exit_price) || 0, parseInt(contracts) || 1,
    commission, enriched.gross_pnl, net_pnl,
    setup_tag_id || null, parseInt(planned_sl_ticks) || null, parseInt(planned_tp_ticks) || null,
    actual_sl_hit ? 1 : 0,
    calcRMultiple(net_pnl, parseInt(planned_sl_ticks) || 0, instrument, parseInt(contracts) || 1, settings),
    rating || null, notes || null, screenshot || null, enriched.session,
    req.params.id
  );

  if (confluence_tag_ids !== undefined) applyTradeTags(req.params.id, confluence_tag_ids, 'confluence');
  if (mistake_tag_ids !== undefined) applyTradeTags(req.params.id, mistake_tag_ids, 'mistake');

  res.json(hydrateTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/import', (req, res) => {
  const { csv, format = 'manual', account_id } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv required' });

  const settings = getSettings(db);
  let records;
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: `CSV parse error: ${e.message}` });
  }

  const inserted = [];
  const skipped = [];
  const errors = [];

  const importOne = db.transaction((row, idx) => {
    try {
      let mapped;
      if (format === 'tradovate') {
        mapped = mapTradovate(row);
      } else if (format === 'rithmic') {
        mapped = mapRithmic(row);
      } else {
        mapped = row;
      }

      // Skip if already imported (dedup by external_id)
      if (mapped.external_id) {
        const existing = db.prepare('SELECT id FROM trades WHERE external_id = ?').get(mapped.external_id);
        if (existing) { skipped.push(idx + 1); return; }
      }

      const instrument = mapped.instrument || 'MNQ';
      const direction = mapped.direction || 'Long';
      const contracts = parseInt(mapped.contracts) || 1;

      const entryRaw = parseFloat(mapped.entry_price);
      const exitRaw = parseFloat(mapped.exit_price);
      const hasValidPrices = !isNaN(entryRaw) && !isNaN(exitRaw) && entryRaw !== 0;
      const entry_price = hasValidPrices ? entryRaw : 0;
      const exit_price = hasValidPrices ? exitRaw : 0;

      const grossRaw = mapped.gross_pnl != null ? String(mapped.gross_pnl).replace(/[$,]/g, '') : '';
      const commRaw = mapped.commission != null ? String(mapped.commission).replace(/[$,]/g, '') : '';
      const hasGross = grossRaw !== '' && !isNaN(parseFloat(grossRaw));

      if (!hasValidPrices && !hasGross) throw new Error('missing prices and P&L');

      const enriched = enrichTrade({
        instrument, direction, entry_price, exit_price, contracts,
        date_time: mapped.date_time || new Date().toISOString(),
        planned_sl_ticks: mapped.planned_sl_ticks,
        gross_pnl: hasGross ? parseFloat(grossRaw) : undefined,
        commission: commRaw !== '' && !isNaN(parseFloat(commRaw)) ? parseFloat(commRaw) : undefined,
      }, settings);

      const info = db.prepare(`
        INSERT INTO trades (date_time, instrument, account_id, direction, entry_price, exit_price,
          contracts, commission, gross_pnl, net_pnl, r_multiple, session, notes, external_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mapped.date_time || new Date().toISOString(),
        instrument, account_id || null, direction,
        entry_price, exit_price, contracts,
        enriched.commission, enriched.gross_pnl, enriched.net_pnl,
        enriched.r_multiple, enriched.session, mapped.notes || null,
        mapped.external_id || null
      );
      inserted.push(info.lastInsertRowid);
    } catch (e) {
      errors.push({ row: idx + 1, error: e.message });
    }
  });

  records.forEach((row, i) => importOne(row, i));
  res.json({ imported: inserted.length, skipped: skipped.length, errors });
});

function parseTradovateDateTime(str) {
  if (!str || !str.trim()) return new Date().toISOString().slice(0, 16);
  const s = str.trim();
  // ISO-like: 2026-05-01T19:58:47 or 2026-05-01 19:58:47
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 16) : d.toISOString().slice(0, 16);
  }
  // MM/DD/YYYY HH:MM:SS or M/D/YYYY H:MM:SS (Tradovate performance export)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?/i);
  if (m) {
    let [, mon, day, year, hr, min, sec, ampm] = m;
    hr = parseInt(hr);
    if (ampm) {
      const ispm = ampm.toUpperCase() === 'PM';
      if (ispm && hr !== 12) hr += 12;
      if (!ispm && hr === 12) hr = 0;
    }
    return `${year}-${mon.padStart(2,'0')}-${day.padStart(2,'0')}T${String(hr).padStart(2,'0')}:${min}:${sec || '00'}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 16) : d.toISOString().slice(0, 16);
}

// Parses Tradovate pnl strings: "$65.00" → 65, "$(115.00)" → -115
function parseTradovatePnL(str) {
  if (str == null || str === '') return null;
  const s = String(str).replace(/\s/g, '');
  const isNeg = s.includes('(');
  const num = parseFloat(s.replace(/[$(),]/g, ''));
  return isNaN(num) ? null : (isNeg ? -num : num);
}

function detectInstrument(symbol) {
  const s = (symbol || '').toUpperCase();
  if (s.startsWith('MNQ')) return 'MNQ';
  if (s.startsWith('NQ'))  return 'NQ';
  if (s.startsWith('MGC')) return 'MGC';
  if (s.startsWith('GC'))  return 'GC';
  return 'MNQ';
}

function mapTradovate(row) {
  // ── Tradovate Performance export ──────────────────────────────────────────
  // Columns: symbol, _priceFormat, _priceFormatType, _tickSize,
  //          buyFillId, sellFillId, qty, buyPrice, sellPrice,
  //          pnl, boughtTimestamp, soldTimestamp, duration
  if (row['symbol'] !== undefined && row['boughtTimestamp'] !== undefined) {
    const symbol = (row['symbol'] || '').toUpperCase();
    const instrument = detectInstrument(symbol);

    const buyPrice = parseFloat(row['buyPrice']);
    const sellPrice = parseFloat(row['sellPrice']);
    const qty = parseInt(row['qty']) || 1;

    // Direction: if soldTimestamp < boughtTimestamp → Short (sold first, then covered)
    const buyISO = parseTradovateDateTime(row['boughtTimestamp']);
    const sellISO = parseTradovateDateTime(row['soldTimestamp']);
    const isShort = sellISO < buyISO;

    const direction = isShort ? 'Short' : 'Long';
    const entryPrice = isShort ? sellPrice : buyPrice;
    const exitPrice  = isShort ? buyPrice  : sellPrice;
    const entryDateTime = isShort ? row['soldTimestamp'] : row['boughtTimestamp'];

    const buyFillId = row['buyFillId'] || row['buyFillID'] || '';
    const sellFillId = row['sellFillId'] || row['sellFillID'] || '';
    return {
      date_time: parseTradovateDateTime(entryDateTime),
      instrument,
      direction,
      entry_price: entryPrice,
      exit_price: exitPrice,
      contracts: qty,
      gross_pnl: parseTradovatePnL(row['pnl']),
      commission: '',   // not in this export — auto-calculated from settings
      external_id: buyFillId && sellFillId ? `${buyFillId}_${sellFillId}` : null,
    };
  }

  // ── Tradovate P&L Report (older / alternate export) ───────────────────────
  // Columns: Contract Name, B/S, Open Date/Time, Open Price, Close Price,
  //          Gross P&L, Commission, Net P&L
  const contract = row['Contract Name'] || row['Contract'] || row['Symbol'] || row['Instrument'] || '';
  const instrument = detectInstrument(contract);

  const bs = (row['B/S'] || row['Action'] || row['Side'] || row['Buy/Sell'] || '').trim().toUpperCase();
  const direction = ['B', 'BUY', 'LONG', 'BUY LONG'].includes(bs) ? 'Long' : 'Short';

  const rawDate = row['Open Date/Time'] || row['Buy Date/Time'] || row['Open Time'] ||
    row['Entry Date/Time'] || row['Date/Time'] || row['Timestamp'] || row['timestamp'] ||
    row['DateTime'] || row['Date'] || '';

  const entryPrice = row['Open Price'] || row['Avg. Buy Price'] || row['Buy Price'] ||
    row['Entry Price'] || row['Avg Entry Price'] || row['Fill Price'] || '';
  const exitPrice = row['Close Price'] || row['Avg. Sell Price'] || row['Sell Price'] ||
    row['Exit Price'] || row['Avg Exit Price'] || '';

  const qty = row['Open Qty'] || row['Buy Qty'] || row['Qty'] || row['Quantity'] || row['Size'] || '1';

  const grossPnL = row['Gross P&L'] || row['Gross PnL'] || row['GrossPnL'] || row['Gross P/L'] || '';
  const commission = row['Commission'] || row['Fees'] || row['Fee'] || '';
  const netPnL = row['Net P&L'] || row['Net PnL'] || row['NetPnL'] || row['Net P/L'] ||
    row['Realized P&L'] || row['Realized PnL'] || row['realizedPnl'] || '';

  return {
    date_time: parseTradovateDateTime(rawDate),
    instrument,
    direction,
    entry_price: entryPrice,
    exit_price: exitPrice,
    contracts: qty,
    gross_pnl: grossPnL,
    commission,
    net_pnl: netPnL,
  };
}

function mapRithmic(row) {
  const dateStr = row['Entry Date'] && row['Entry Time']
    ? `${row['Entry Date']}T${row['Entry Time']}`
    : row['Date'] || '';
  return {
    date_time: parseTradovateDateTime(dateStr),
    instrument: (row['Symbol'] || '').toUpperCase().includes('MNQ') ? 'MNQ'
      : (row['Symbol'] || '').toUpperCase().includes('NQ') ? 'NQ' : 'MNQ',
    direction: (row['Side'] || '').toUpperCase() === 'BUY' ? 'Long' : 'Short',
    entry_price: row['Entry Price'] || '',
    exit_price: row['Exit Price'] || '',
    contracts: row['Qty'] || '1',
  };
}

module.exports = router;
