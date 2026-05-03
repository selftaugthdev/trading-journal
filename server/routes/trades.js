const express = require('express');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const { getSettings, calcGrossPnL, calcCommission, calcRMultiple, determineSession } = require('../utils');
const router = express.Router();

function enrichTrade(body, settings) {
  const { instrument, direction, entry_price, exit_price, contracts,
    planned_sl_ticks, commission: manualCommission } = body;

  const ep = parseFloat(entry_price);
  const xp = parseFloat(exit_price);
  const c = parseInt(contracts) || 1;

  const gross_pnl = calcGrossPnL(instrument, direction, ep, xp, c);
  const commission = manualCommission != null ? parseFloat(manualCommission) : calcCommission(instrument, c, settings);
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
    parseFloat(entry_price), parseFloat(exit_price), parseInt(contracts) || 1,
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
    parseFloat(entry_price), parseFloat(exit_price), parseInt(contracts) || 1,
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
  const { csv, format = 'manual' } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv required' });

  const settings = getSettings(db);
  let records;
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: `CSV parse error: ${e.message}` });
  }

  const inserted = [];
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

      const instrument = mapped.instrument || 'MNQ';
      const direction = mapped.direction || 'Long';
      const entry_price = parseFloat(mapped.entry_price);
      const exit_price = parseFloat(mapped.exit_price);
      const contracts = parseInt(mapped.contracts) || 1;

      if (isNaN(entry_price) || isNaN(exit_price)) throw new Error('invalid prices');

      const enriched = enrichTrade({ instrument, direction, entry_price, exit_price, contracts,
        date_time: mapped.date_time || new Date().toISOString(),
        planned_sl_ticks: mapped.planned_sl_ticks }, settings);

      const info = db.prepare(`
        INSERT INTO trades (date_time, instrument, direction, entry_price, exit_price, contracts,
          commission, gross_pnl, net_pnl, r_multiple, session, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mapped.date_time || new Date().toISOString(), instrument, direction,
        entry_price, exit_price, contracts,
        enriched.commission, enriched.gross_pnl, enriched.net_pnl,
        enriched.r_multiple, enriched.session, mapped.notes || null
      );
      inserted.push(info.lastInsertRowid);
    } catch (e) {
      errors.push({ row: idx + 1, error: e.message });
    }
  });

  records.forEach((row, i) => importOne(row, i));
  res.json({ imported: inserted.length, errors });
});

function mapTradovate(row) {
  return {
    date_time: row['Buy/Sell Time'] || row['Entry Time'] || new Date().toISOString(),
    instrument: (row['Contract'] || '').includes('NQ') ?
      ((row['Contract'] || '').includes('MNQ') ? 'MNQ' : 'NQ') : 'MNQ',
    direction: row['B/S'] === 'B' || row['B/S'] === 'Buy' ? 'Long' : 'Short',
    entry_price: row['Avg Entry Price'] || row['Entry Price'],
    exit_price: row['Avg Exit Price'] || row['Exit Price'],
    contracts: row['Qty'] || row['Quantity'],
  };
}

function mapRithmic(row) {
  return {
    date_time: `${row['Entry Date']}T${row['Entry Time']}` || new Date().toISOString(),
    instrument: (row['Symbol'] || '').includes('NQ') ?
      ((row['Symbol'] || '').includes('MNQ') ? 'MNQ' : 'NQ') : 'MNQ',
    direction: row['Side'] === 'Buy' ? 'Long' : 'Short',
    entry_price: row['Entry Price'],
    exit_price: row['Exit Price'],
    contracts: row['Qty'],
  };
}

module.exports = router;
