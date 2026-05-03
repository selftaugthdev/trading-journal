# NQ/MNQ Trading Journal

A local trading journal for NQ and MNQ futures. Dark-themed, desktop-first, no cloud, no auth.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Backend**: Node.js + Express
- **Database**: SQLite via better-sqlite3 (stored at `./data/journal.db`)

## Setup

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start both server and client
npm start
```

- API server: http://localhost:3001
- App: http://localhost:5173

## Features

### Trade Log
Full CRUD for trades with: instrument (NQ/MNQ), account, direction, entry/exit prices, contracts, auto-calculated gross/net P&L, commission, R-multiple, setup/confluence/mistake tags, session (London/NY/Overnight auto-detected), rating (1–5 stars), inline notes editing, CSV import/export.

### Dashboard
Filterable analytics: cumulative equity curve, daily P&L bar chart, P&L by session/weekday/setup/confluence, R-multiple distribution histogram, breakdown tables by setup/mistake/account.

### Calendar
Monthly grid with per-day P&L, trade count, win rate. Click any day for a detailed side panel. Weekly totals column. Monthly summary bar.

### Settings
- Account management (add/rename/delete, starting balance)
- Commission rates and tick values per instrument
- Custom setup, confluence, and mistake tag management
- CSV import format selection (Manual / Tradovate / Rithmic)

## P&L Calculations

| Instrument | Point Value | Tick Value | Default Commission |
|------------|-------------|------------|--------------------|
| NQ         | $20/pt      | $5/tick    | $4.20/contract RT  |
| MNQ        | $2/pt       | $0.50/tick | $2.10/contract RT  |

**R-Multiple** = Net P&L ÷ (Planned SL ticks × tick value × contracts)

**Session** (ET, UTC-5 approx):
- London: 02:00–05:00
- NY: 08:30–11:00
- Overnight: all other times

## CSV Import

Manual format columns: `date_time, instrument, direction, entry_price, exit_price, contracts, notes`

Tradovate and Rithmic formats are auto-mapped from their native export columns.

## Database

SQLite file lives at `./data/journal.db`. Back it up by copying that file.
