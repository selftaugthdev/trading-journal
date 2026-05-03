const express = require('express');
const db = require('../db');
const router = express.Router();

function buildFilters(query) {
  const { start, end, account_id } = query;
  const conditions = [];
  const params = [];
  if (start) { conditions.push('date_time >= ?'); params.push(start); }
  if (end) { conditions.push('date_time <= ?'); params.push(end + 'T23:59:59'); }
  if (account_id) { conditions.push('account_id = ?'); params.push(account_id); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, params };
}

router.get('/summary', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const trades = db.prepare(`SELECT * FROM trades ${where} ORDER BY date_time`).all(...params);

  if (trades.length === 0) return res.json(null);

  const wins = trades.filter(t => t.net_pnl > 0);
  const losses = trades.filter(t => t.net_pnl <= 0);
  const grossWins = wins.reduce((s, t) => s + t.gross_pnl, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.gross_pnl, 0));
  const totalNetPnL = trades.reduce((s, t) => s + t.net_pnl, 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.net_pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.net_pnl, 0) / losses.length : 0;
  const rMultiples = trades.filter(t => t.r_multiple != null).map(t => t.r_multiple);
  const avgR = rMultiples.length ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length : 0;

  // Max drawdown on cumulative equity
  let peak = 0, maxDD = 0, cumulative = 0;
  for (const t of trades) {
    cumulative += t.net_pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }

  res.json({
    total_trades: trades.length,
    win_rate: +(wins.length / trades.length * 100).toFixed(1),
    total_net_pnl: +totalNetPnL.toFixed(2),
    profit_factor: grossLosses > 0 ? +(grossWins / grossLosses).toFixed(2) : null,
    avg_win: +avgWin.toFixed(2),
    avg_loss: +avgLoss.toFixed(2),
    avg_r_multiple: +avgR.toFixed(2),
    max_drawdown: +maxDD.toFixed(2),
    expectancy: +avgR.toFixed(2),
  });
});

router.get('/equity', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const trades = db.prepare(`SELECT date_time, net_pnl FROM trades ${where} ORDER BY date_time`).all(...params);
  let cum = 0;
  const data = trades.map(t => {
    cum += t.net_pnl;
    return { date: t.date_time.slice(0, 10), cumPnL: +cum.toFixed(2), pnl: +t.net_pnl.toFixed(2) };
  });
  res.json(data);
});

router.get('/daily', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rows = db.prepare(`
    SELECT substr(date_time, 1, 10) as day,
      SUM(net_pnl) as net_pnl,
      COUNT(*) as trade_count,
      SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as wins
    FROM trades ${where}
    GROUP BY day ORDER BY day
  `).all(...params);
  res.json(rows.map(r => ({
    day: r.day,
    net_pnl: +r.net_pnl.toFixed(2),
    trade_count: r.trade_count,
    win_rate: +(r.wins / r.trade_count * 100).toFixed(1),
  })));
});

router.get('/by-session', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rows = db.prepare(`
    SELECT session,
      SUM(net_pnl) as net_pnl,
      COUNT(*) as trade_count,
      SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as wins
    FROM trades ${where}
    GROUP BY session
  `).all(...params);
  res.json(rows.map(r => ({
    session: r.session,
    net_pnl: +r.net_pnl.toFixed(2),
    trade_count: r.trade_count,
    win_rate: +(r.wins / r.trade_count * 100).toFixed(1),
  })));
});

router.get('/by-weekday', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rows = db.prepare(`
    SELECT strftime('%w', date_time) as dow,
      SUM(net_pnl) as net_pnl,
      COUNT(*) as trade_count,
      SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as wins
    FROM trades ${where}
    GROUP BY dow ORDER BY dow
  `).all(...params);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  res.json(rows.map(r => ({
    day: names[parseInt(r.dow)],
    net_pnl: +r.net_pnl.toFixed(2),
    trade_count: r.trade_count,
    win_rate: +(r.wins / r.trade_count * 100).toFixed(1),
  })));
});

router.get('/by-setup', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const extra = params.length
    ? ' AND ' + where.replace('WHERE ', '').split(' AND ').map(c => 'tr.' + c).join(' AND ')
    : '';
  const rows = db.prepare(`
    SELECT t.id, t.name, t.color,
      SUM(tr.net_pnl) as net_pnl,
      COUNT(tr.id) as trade_count,
      SUM(CASE WHEN tr.net_pnl > 0 THEN 1 ELSE 0 END) as wins,
      AVG(tr.r_multiple) as avg_r
    FROM tags t
    JOIN trades tr ON tr.setup_tag_id = t.id
    WHERE t.type = 'setup'${extra}
    GROUP BY t.id ORDER BY net_pnl DESC
  `).all(...params);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, color: r.color,
    net_pnl: +r.net_pnl.toFixed(2),
    trade_count: r.trade_count,
    win_rate: +(r.wins / r.trade_count * 100).toFixed(1),
    avg_r: r.avg_r != null ? +r.avg_r.toFixed(2) : null,
  })));
});

router.get('/by-confluence', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const extra = params.length
    ? ' AND ' + where.replace('WHERE ', '').split(' AND ').map(c => 'tr.' + c).join(' AND ')
    : '';
  const rows = db.prepare(`
    SELECT t.id, t.name, t.color,
      SUM(tr.net_pnl) as net_pnl,
      COUNT(tr.id) as trade_count,
      SUM(CASE WHEN tr.net_pnl > 0 THEN 1 ELSE 0 END) as wins
    FROM tags t
    JOIN trade_tags tt ON tt.tag_id = t.id AND tt.tag_role = 'confluence'
    JOIN trades tr ON tr.id = tt.trade_id
    WHERE 1=1${extra}
    GROUP BY t.id ORDER BY net_pnl DESC
  `).all(...params);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, color: r.color,
    net_pnl: +r.net_pnl.toFixed(2),
    trade_count: r.trade_count,
    win_rate: +(r.wins / r.trade_count * 100).toFixed(1),
  })));
});

router.get('/mistakes', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const extra = params.length
    ? ' AND ' + where.replace('WHERE ', '').split(' AND ').map(c => 'tr.' + c).join(' AND ')
    : '';
  const rows = db.prepare(`
    SELECT t.id, t.name, t.color,
      COUNT(tr.id) as frequency,
      SUM(tr.net_pnl) as total_pnl
    FROM tags t
    JOIN trade_tags tt ON tt.tag_id = t.id AND tt.tag_role = 'mistake'
    JOIN trades tr ON tr.id = tt.trade_id
    WHERE 1=1${extra}
    GROUP BY t.id ORDER BY frequency DESC
  `).all(...params);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, color: r.color,
    frequency: r.frequency,
    total_pnl: +r.total_pnl.toFixed(2),
  })));
});

router.get('/by-account', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const extra = params.length
    ? ' AND ' + where.replace('WHERE ', '').split(' AND ').map(c => 'tr.' + c).join(' AND ')
    : '';
  const rows = db.prepare(`
    SELECT a.id, a.name,
      SUM(tr.net_pnl) as net_pnl,
      COUNT(tr.id) as trade_count,
      SUM(CASE WHEN tr.net_pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN tr.gross_pnl > 0 THEN tr.gross_pnl ELSE 0 END) as gross_wins,
      SUM(CASE WHEN tr.gross_pnl <= 0 THEN ABS(tr.gross_pnl) ELSE 0 END) as gross_losses
    FROM accounts a
    JOIN trades tr ON tr.account_id = a.id
    WHERE 1=1${extra}
    GROUP BY a.id ORDER BY net_pnl DESC
  `).all(...params);
  res.json(rows.map(r => ({
    id: r.id, name: r.name,
    net_pnl: +r.net_pnl.toFixed(2),
    trade_count: r.trade_count,
    win_rate: +(r.wins / r.trade_count * 100).toFixed(1),
    profit_factor: r.gross_losses > 0 ? +(r.gross_wins / r.gross_losses).toFixed(2) : null,
  })));
});

router.get('/r-distribution', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rWhere = where ? `${where} AND r_multiple IS NOT NULL` : 'WHERE r_multiple IS NOT NULL';
  const trades = db.prepare(`SELECT r_multiple FROM trades ${rWhere}`).all(...params);

  const buckets = [
    { label: '<-3', min: -Infinity, max: -3 },
    { label: '-3 to -2', min: -3, max: -2 },
    { label: '-2 to -1', min: -2, max: -1 },
    { label: '-1 to 0', min: -1, max: 0 },
    { label: '0 to 1', min: 0, max: 1 },
    { label: '1 to 2', min: 1, max: 2 },
    { label: '2 to 3', min: 2, max: 3 },
    { label: '>3', min: 3, max: Infinity },
  ];

  const result = buckets.map(b => ({
    label: b.label,
    count: trades.filter(t => t.r_multiple > b.min && t.r_multiple <= b.max).length,
  }));
  res.json(result);
});

module.exports = router;
