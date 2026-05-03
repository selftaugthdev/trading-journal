import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(val, showSign = true) {
  if (val == null || isNaN(val)) return '—';
  const abs = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!showSign) return `$${abs}`;
  if (val > 0) return `+$${abs}`;
  if (val < 0) return `-$${abs}`;
  return `$${abs}`;
}

export function pnlClass(val) {
  if (val == null || isNaN(val) || val === 0) return 'pnl-neutral';
  return val > 0 ? 'pnl-positive' : 'pnl-negative';
}

export function formatPct(val) {
  if (val == null || isNaN(val)) return '—';
  return `${val.toFixed(1)}%`;
}

export function formatR(val) {
  if (val == null || isNaN(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}R`;
}

export function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function sessionColor(session) {
  const map = { London: 'bg-blue-900/40 text-blue-300', NY: 'bg-emerald-900/40 text-emerald-300', Overnight: 'bg-slate-700/40 text-slate-400' };
  return map[session] || 'bg-slate-700/40 text-slate-400';
}

export function directionColor(dir) {
  return dir === 'Long' ? 'text-profit' : 'text-loss';
}

export function stars(rating) {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export function calcGrossPnL(instrument, direction, entry, exit, contracts) {
  const pv = instrument === 'NQ' ? 20 : 2;
  const diff = direction === 'Long' ? exit - entry : entry - exit;
  return +(diff * contracts * pv).toFixed(2);
}

export function calcCommission(instrument, contracts, settings) {
  const rate = instrument === 'NQ'
    ? parseFloat(settings?.commission_nq ?? 4.20)
    : parseFloat(settings?.commission_mnq ?? 2.10);
  return +(rate * contracts).toFixed(2);
}

export function calcRMultiple(netPnL, slTicks, instrument, contracts, settings) {
  if (!slTicks || slTicks <= 0) return null;
  const tv = instrument === 'NQ'
    ? parseFloat(settings?.tick_value_nq ?? 5)
    : parseFloat(settings?.tick_value_mnq ?? 0.5);
  const risk = slTicks * tv * contracts;
  return risk > 0 ? +(netPnL / risk).toFixed(2) : null;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
