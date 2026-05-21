const POINT_VALUES = { NQ: 20, MNQ: 2, GC: 100, MGC: 10 };

const COMMISSION_DEFAULTS = { NQ: 4.20, MNQ: 2.10, GC: 2.50, MGC: 0.50 };
const TICK_VALUE_DEFAULTS = { NQ: 5, MNQ: 0.50, GC: 10, MGC: 1 };

function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function calcGrossPnL(instrument, direction, entryPrice, exitPrice, contracts) {
  const pv = POINT_VALUES[instrument] ?? 20;
  const diff = direction === 'Long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return +(diff * contracts * pv).toFixed(2);
}

function calcCommission(instrument, contracts, settings) {
  const key = `commission_${instrument.toLowerCase()}`;
  const rate = parseFloat(settings[key] ?? COMMISSION_DEFAULTS[instrument] ?? 0);
  return +(rate * contracts).toFixed(2);
}

function calcRMultiple(netPnL, plannedSLTicks, instrument, contracts, settings) {
  if (!plannedSLTicks || plannedSLTicks <= 0) return null;
  const key = `tick_value_${instrument.toLowerCase()}`;
  const tv = parseFloat(settings[key] ?? TICK_VALUE_DEFAULTS[instrument] ?? 1);
  const risk = plannedSLTicks * tv * contracts;
  return risk > 0 ? +(netPnL / risk).toFixed(2) : null;
}

function determineSession(dateTimeStr) {
  const d = new Date(dateTimeStr);
  // Approximate ET as UTC-5 (ignoring DST for simplicity)
  const etMinutes = ((d.getUTCHours() * 60 + d.getUTCMinutes()) - 300 + 1440) % 1440;
  if (etMinutes >= 120 && etMinutes < 300) return 'London';
  if (etMinutes >= 510 && etMinutes < 660) return 'NY';
  return 'Overnight';
}

module.exports = { getSettings, calcGrossPnL, calcCommission, calcRMultiple, determineSession };
