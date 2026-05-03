const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'journal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    starting_balance REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('setup','confluence','mistake')),
    color TEXT DEFAULT '#8B5CF6',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, type)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_time TEXT NOT NULL,
    instrument TEXT NOT NULL CHECK(instrument IN ('NQ','MNQ')),
    account_id INTEGER,
    direction TEXT NOT NULL CHECK(direction IN ('Long','Short')),
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    contracts INTEGER NOT NULL DEFAULT 1,
    commission REAL,
    gross_pnl REAL,
    net_pnl REAL,
    setup_tag_id INTEGER,
    planned_sl_ticks INTEGER,
    planned_tp_ticks INTEGER,
    actual_sl_hit INTEGER DEFAULT 0,
    r_multiple REAL,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    notes TEXT,
    screenshot TEXT,
    session TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (setup_tag_id) REFERENCES tags(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS trade_tags (
    trade_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    tag_role TEXT NOT NULL CHECK(tag_role IN ('confluence','mistake')),
    PRIMARY KEY (trade_id, tag_id),
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
[
  ['commission_nq', '4.20'],
  ['commission_mnq', '2.10'],
  ['tick_value_nq', '5'],
  ['tick_value_mnq', '0.50'],
  ['csv_format', 'manual'],
].forEach(([k, v]) => insertSetting.run(k, v));

const insertAccount = db.prepare('INSERT OR IGNORE INTO accounts (name, starting_balance) VALUES (?, ?)');
insertAccount.run('Apex', 0);
insertAccount.run('Lucid', 0);

const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, type, color) VALUES (?, ?, ?)');
[
  ['ICT IFVG', 'setup', '#8B5CF6'],
  ['OB Rejection', 'setup', '#7C3AED'],
  ['Liquidity Sweep', 'setup', '#6D28D9'],
  ['Breaker Block', 'setup', '#5B21B6'],
].forEach(([n, t, c]) => insertTag.run(n, t, c));
[
  ['GEX Wall', 'confluence', '#10B981'],
  ['London Session', 'confluence', '#059669'],
  ['NY Session', 'confluence', '#047857'],
  ['HTF Bias Long', 'confluence', '#065F46'],
  ['HTF Bias Short', 'confluence', '#EF4444'],
  ['Kill Zone', 'confluence', '#F59E0B'],
].forEach(([n, t, c]) => insertTag.run(n, t, c));
[
  ['Overtraded', 'mistake', '#EF4444'],
  ['Moved SL', 'mistake', '#DC2626'],
  ['FOMO Entry', 'mistake', '#F97316'],
  ['Sized Too Big', 'mistake', '#EAB308'],
  ['Ignored HTF Bias', 'mistake', '#F59E0B'],
  ['No Setup', 'mistake', '#B45309'],
].forEach(([n, t, c]) => insertTag.run(n, t, c));

module.exports = db;
