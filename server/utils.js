const POINT_VALUES = { NQ: 20, MNQ: 2 };

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
  const rate = instrument === 'NQ'
    ? parseFloat(settings.commission_nq ?? 4.20)
    : parseFloat(settings.commission_mnq ?? 2.10);
  return +(rate * contracts).toFixed(2);
}

function calcRMultiple(netPnL, plannedSLTicks, instrument, contracts, settings) {
  if (!plannedSLTicks || plannedSLTicks <= 0) return null;
  const tv = instrument === 'NQ'
    ? parseFloat(settings.tick_value_nq ?? 5)
    : parseFloat(settings.tick_value_mnq ?? 0.50);
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
