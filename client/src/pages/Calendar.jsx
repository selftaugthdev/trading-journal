import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, formatCurrency, formatDateTime, pnlClass, formatPct, directionColor } from '../lib/utils.js';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';

function groupByDay(trades) {
  const map = {};
  for (const t of trades) {
    const day = t.date_time.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(t);
  }
  return map;
}

function dayStats(trades) {
  if (!trades?.length) return null;
  const net = trades.reduce((s, t) => s + (t.net_pnl || 0), 0);
  const wins = trades.filter(t => t.net_pnl > 0).length;
  return { net, trades: trades.length, winRate: (wins / trades.length) * 100 };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayTrades, setSelectedDayTrades] = useState([]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  useEffect(() => {
    loadTrades();
  }, [currentDate]);

  async function loadTrades() {
    setLoading(true);
    const start = format(monthStart, 'yyyy-MM-dd');
    const end = format(monthEnd, 'yyyy-MM-dd');
    try {
      const data = await api.getTrades({ start, end });
      setTrades(data);
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    setSelectedDay(null);
  }

  function nextMonth() {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    setSelectedDay(null);
  }

  const byDay = groupByDay(trades);

  function handleDayClick(day) {
    const key = format(day, 'yyyy-MM-dd');
    const dayTrades = byDay[key] || [];
    setSelectedDay(key);
    setSelectedDayTrades(dayTrades);
  }

  // Monthly summary
  const monthlyNet = trades.reduce((s, t) => s + (t.net_pnl || 0), 0);
  const monthlyWins = trades.filter(t => t.net_pnl > 0).length;
  const monthlyWR = trades.length ? (monthlyWins / trades.length) * 100 : 0;

  // Best/worst day
  const dayNets = Object.entries(byDay).map(([d, ts]) => ({ day: d, net: ts.reduce((s, t) => s + t.net_pnl, 0) }));
  const bestDay = dayNets.sort((a, b) => b.net - a.net)[0];
  const worstDay = [...dayNets].sort((a, b) => a.net - b.net)[0];

  // Weekly totals (right column)
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const weekDays = days.slice(i, i + 7);
    const weekTrades = weekDays.flatMap(d => byDay[format(d, 'yyyy-MM-dd')] || []);
    const net = weekTrades.reduce((s, t) => s + (t.net_pnl || 0), 0);
    weeks.push({ net, count: weekTrades.length });
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Calendar</h1>
        <div className="flex items-center gap-3">
          <button className="btn-ghost p-2 rounded-lg" onClick={prevMonth}><ChevronLeft size={18} /></button>
          <h2 className="text-lg font-semibold text-slate-200 w-40 text-center">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button className="btn-ghost p-2 rounded-lg" onClick={nextMonth}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="flex-1 card p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-[repeat(7,1fr)_80px] gap-1 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-slate-500 pb-2">{d}</div>
            ))}
            <div className="text-center text-xs font-medium text-slate-500 pb-2">Week</div>
          </div>

          {/* Days */}
          {Array.from({ length: days.length / 7 }, (_, wi) => (
            <div key={wi} className="grid grid-cols-[repeat(7,1fr)_80px] gap-1 mb-1">
              {days.slice(wi * 7, wi * 7 + 7).map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const stats = dayStats(byDay[key]);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = selectedDay === key;
                const isToday = isSameDay(day, new Date());

                return (
                  <div key={key}
                    onClick={() => isCurrentMonth && handleDayClick(day)}
                    className={cn(
                      'min-h-[80px] rounded-lg p-2 border transition-all',
                      isCurrentMonth ? 'cursor-pointer' : 'opacity-30 cursor-default',
                      isSelected ? 'border-violet-500 bg-violet-900/20' : 'border-border hover:border-slate-600',
                      !stats && isCurrentMonth ? 'bg-surface-3/30' : '',
                      stats && stats.net > 0 ? 'bg-emerald-900/10' : '',
                      stats && stats.net < 0 ? 'bg-red-900/10' : '',
                    )}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-xs font-medium',
                        isToday ? 'text-violet-400' : isCurrentMonth ? 'text-slate-400' : 'text-slate-600')}>
                        {format(day, 'd')}
                      </span>
                      {stats && <span className="text-[10px] text-slate-500">{stats.trades}t</span>}
                    </div>
                    {stats && (
                      <div className="space-y-0.5">
                        <p className={cn('text-xs font-mono font-semibold', stats.net >= 0 ? 'text-profit' : 'text-loss')}>
                          {formatCurrency(stats.net)}
                        </p>
                        <p className="text-[10px] text-slate-500">{formatPct(stats.winRate)}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Week total */}
              <div className="min-h-[80px] rounded-lg p-2 bg-surface-3/50 border border-border flex flex-col justify-center items-center">
                {weeks[wi]?.count > 0 ? (
                  <>
                    <p className={cn('text-xs font-mono font-semibold', weeks[wi].net >= 0 ? 'text-profit' : 'text-loss')}>
                      {formatCurrency(weeks[wi].net)}
                    </p>
                    <p className="text-[10px] text-slate-500">{weeks[wi].count} trades</p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-600">—</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div className="w-80 card space-y-3 self-start sticky top-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">
                {format(parseISO(selectedDay), 'EEEE, MMM d')}
              </h3>
              <button className="btn-ghost p-1 rounded" onClick={() => setSelectedDay(null)}>
                <X size={14} />
              </button>
            </div>
            {selectedDayTrades.length === 0 ? (
              <p className="text-slate-500 text-sm">No trades this day.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 pb-2 border-b border-border">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Net P&L</p>
                    <p className={cn('text-sm font-mono font-bold',
                      selectedDayTrades.reduce((s, t) => s + t.net_pnl, 0) >= 0 ? 'text-profit' : 'text-loss')}>
                      {formatCurrency(selectedDayTrades.reduce((s, t) => s + t.net_pnl, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Trades</p>
                    <p className="text-sm font-bold text-slate-200">{selectedDayTrades.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Win Rate</p>
                    <p className="text-sm font-bold text-slate-200">
                      {formatPct(selectedDayTrades.filter(t => t.net_pnl > 0).length / selectedDayTrades.length * 100)}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {selectedDayTrades.map(t => (
                    <div key={t.id} className="bg-surface-3 rounded-lg p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={cn('text-xs font-medium', directionColor(t.direction))}>{t.direction}</span>
                        <span className="text-xs text-slate-500 font-mono">{t.date_time.slice(11, 16)}</span>
                        <span className={cn('text-xs font-mono font-semibold', pnlClass(t.net_pnl))}>
                          {formatCurrency(t.net_pnl)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{t.instrument}</span>
                        <span>·</span>
                        <span>{t.contracts}c</span>
                        <span>·</span>
                        <span>{t.entry_price} → {t.exit_price}</span>
                      </div>
                      {t.setupTag && (
                        <span className="badge bg-violet-900/30 text-violet-300 text-[10px]">{t.setupTag.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Monthly Summary Bar */}
      <div className="card">
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Monthly Net P&L</p>
            <p className={cn('text-xl font-mono font-bold', monthlyNet >= 0 ? 'text-profit' : 'text-loss')}>
              {formatCurrency(monthlyNet)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Trades</p>
            <p className="text-xl font-bold text-slate-200">{trades.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Win Rate</p>
            <p className="text-xl font-bold text-slate-200">{formatPct(monthlyWR)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Best Day</p>
            <p className="text-xl font-mono font-bold text-profit">
              {bestDay ? formatCurrency(bestDay.net) : '—'}
            </p>
            {bestDay && <p className="text-xs text-slate-500">{format(parseISO(bestDay.day), 'MMM d')}</p>}
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Worst Day</p>
            <p className="text-xl font-mono font-bold text-loss">
              {worstDay ? formatCurrency(worstDay.net) : '—'}
            </p>
            {worstDay && <p className="text-xs text-slate-500">{format(parseISO(worstDay.day), 'MMM d')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
