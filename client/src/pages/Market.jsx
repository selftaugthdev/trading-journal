import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, Key, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { format, parseISO, isToday, isPast } from 'date-fns';

// ── Ticker card ────────────────────────────────────────────────────────────────

function TickerCard({ ticker, loading }) {
  if (loading || !ticker) {
    return (
      <div className="card flex-1 min-w-[160px] animate-pulse">
        <div className="h-3 w-16 bg-surface-4 rounded mb-3" />
        <div className="h-7 w-28 bg-surface-4 rounded mb-2" />
        <div className="h-3 w-20 bg-surface-4 rounded" />
      </div>
    );
  }

  const { label, name, price, change, changePercent } = ticker;
  const up = change > 0;
  const down = change < 0;
  const flat = !up && !down;

  const priceStr = price == null ? '—'
    : label === 'BTC'
      ? price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const changePctStr = changePercent == null ? '' : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
  const changeStr = change == null ? '' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;

  return (
    <div className={cn(
      'card flex-1 min-w-[160px] border transition-colors',
      up && 'border-profit/30 bg-profit/5',
      down && 'border-loss/30 bg-loss/5',
      flat && 'border-border',
    )}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="text-xs font-bold text-slate-300 tracking-wide">{label}</span>
          <span className="text-[10px] text-slate-500 ml-2">{name}</span>
        </div>
        {up && <TrendingUp size={14} className="text-profit mt-0.5 shrink-0" />}
        {down && <TrendingDown size={14} className="text-loss mt-0.5 shrink-0" />}
        {flat && <Minus size={14} className="text-slate-500 mt-0.5 shrink-0" />}
      </div>
      <p className={cn('text-2xl font-bold font-mono leading-none mb-1.5',
        up ? 'text-profit' : down ? 'text-loss' : 'text-slate-200')}>
        {label === 'BTC' ? '' : ''}{priceStr}
      </p>
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={cn(up ? 'text-profit' : down ? 'text-loss' : 'text-slate-400')}>
          {changePctStr}
        </span>
        <span className={cn('text-[10px]', up ? 'text-profit/70' : down ? 'text-loss/70' : 'text-slate-600')}>
          {changeStr}
        </span>
      </div>
    </div>
  );
}

// ── Impact badge ───────────────────────────────────────────────────────────────

function ImpactBadge({ impact }) {
  const map = {
    high:   'bg-red-900/50 text-red-300 border-red-800/60',
    medium: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
    low:    'bg-slate-700/40 text-slate-400 border-slate-600/40',
  };
  const labels = { high: 'HIGH', medium: 'MED', low: 'LOW' };
  const cls = map[impact] ?? map.low;
  return (
    <span className={cn('badge border text-[10px] font-bold tracking-wide', cls)}>
      {labels[impact] ?? impact?.toUpperCase() ?? '—'}
    </span>
  );
}

// ── Value cell (colors actual vs forecast) ─────────────────────────────────────

function ValueCell({ actual, estimate, label }) {
  if (actual == null && estimate == null) return <span className="text-slate-600">—</span>;
  if (label === 'actual' && actual != null && estimate != null) {
    const beat = actual > estimate;
    const miss = actual < estimate;
    return (
      <span className={cn('font-mono font-semibold', beat ? 'text-profit' : miss ? 'text-loss' : 'text-slate-300')}>
        {actual}
      </span>
    );
  }
  const val = label === 'actual' ? actual : label === 'estimate' ? estimate : null;
  if (val == null) return <span className="text-slate-600">—</span>;
  return <span className="font-mono text-slate-400">{val}</span>;
}

// ── Calendar section ───────────────────────────────────────────────────────────

const HIGH_IMPACT_KEYWORDS = [
  'fomc', 'fed', 'rate decision', 'interest rate', 'federal funds',
  'nonfarm', 'payroll', 'unemployment', 'jobless', 'jolts',
  'cpi', 'core cpi', 'ppi', 'core ppi', 'inflation',
  'gdp', 'gross domestic',
  'ism', 'pmi', 'manufacturing', 'services pmi',
  'retail sales', 'consumer', 'pce', 'personal income',
  'treasury', 'bond auction',
  'jackson hole', 'beige book', 'minutes',
];

function isKeyEvent(event) {
  const name = (event.event || '').toLowerCase();
  return HIGH_IMPACT_KEYWORDS.some(k => name.includes(k));
}

function groupByDay(events) {
  const groups = {};
  for (const e of events) {
    const day = (e.time || '').slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }
  return groups;
}

function CalendarSection({ calData, loading, noKey }) {
  const [filter, setFilter] = useState('high');

  if (noKey) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 gap-4 text-center">
        <Key size={32} className="text-slate-600" />
        <div>
          <p className="text-slate-300 font-medium mb-1">Finnhub API key required for economic calendar</p>
          <p className="text-slate-500 text-sm">Sign up free at finnhub.io — add your key in Settings → Market Data</p>
        </div>
        <a href="https://finnhub.io/register" target="_blank" rel="noreferrer"
          className="btn-secondary text-xs gap-1.5">
          <ExternalLink size={12} /> Get free API key
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card">
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-surface-3 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const allEvents = calData?.events || [];
  const filtered = filter === 'high'
    ? allEvents.filter(e => e.impact === 'high' || isKeyEvent(e))
    : allEvents;

  const grouped = groupByDay(filtered);
  const days = Object.keys(grouped).sort();

  const { from, to } = calData || {};

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-200">Economic Calendar</h3>
          {from && to && (
            <p className="text-xs text-slate-500 mt-0.5">
              Week of {format(parseISO(from), 'MMM d')} – {format(parseISO(to), 'MMM d, yyyy')} · Times in ET
            </p>
          )}
        </div>
        <div className="flex bg-surface-3 rounded-lg p-0.5 gap-0.5">
          {[['high', 'High Impact'], ['all', 'All Events']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                filter === val ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200')}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-8">
          {allEvents.length === 0 ? 'No US events found for this week.' : 'No high-impact events this week.'}
        </p>
      )}

      <div className="space-y-4">
        {days.map(day => {
          const dayEvents = grouped[day];
          const dateObj = parseISO(day);
          const todayFlag = isToday(dateObj);

          return (
            <div key={day}>
              {/* Day header */}
              <div className={cn(
                'flex items-center gap-3 mb-2 pb-1.5 border-b',
                todayFlag ? 'border-violet-600/50' : 'border-border',
              )}>
                <span className={cn('text-sm font-bold',
                  todayFlag ? 'text-violet-400' : 'text-slate-300')}>
                  {format(dateObj, 'EEEE')}
                </span>
                <span className="text-xs text-slate-500">{format(dateObj, 'MMMM d')}</span>
                {todayFlag && (
                  <span className="badge bg-violet-600/30 text-violet-300 border border-violet-600/40 text-[10px]">TODAY</span>
                )}
                <span className="text-xs text-slate-600 ml-auto">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Events table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[580px]">
                  <thead>
                    <tr className="text-slate-600 text-[10px] uppercase tracking-wider">
                      <th className="text-left pb-1.5 pr-4 w-16">Time</th>
                      <th className="text-left pb-1.5 pr-4">Event</th>
                      <th className="text-center pb-1.5 pr-4 w-20">Impact</th>
                      <th className="text-right pb-1.5 pr-4 w-24">Previous</th>
                      <th className="text-right pb-1.5 pr-4 w-24">Forecast</th>
                      <th className="text-right pb-1.5 w-24">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-3/50">
                    {dayEvents.map((ev, i) => {
                      const time = ev.time?.slice(11, 16) || '';
                      const released = ev.actual != null;
                      const isFOMC = (ev.event || '').toLowerCase().includes('fomc')
                        || (ev.event || '').toLowerCase().includes('rate decision')
                        || (ev.event || '').toLowerCase().includes('federal funds');

                      return (
                        <tr key={i} className={cn(
                          'group transition-colors',
                          isFOMC ? 'bg-violet-900/10' : '',
                          !released && todayFlag ? 'bg-surface-3/30' : '',
                        )}>
                          <td className="py-2.5 pr-4 font-mono text-slate-400 whitespace-nowrap">{time || '—'}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              {isFOMC && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                              <span className={cn('font-medium', isFOMC ? 'text-violet-300' : 'text-slate-300')}>
                                {ev.event}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-center">
                            <ImpactBadge impact={ev.impact} />
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-500 font-mono">
                            {ev.prev != null ? ev.prev : '—'}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono text-slate-400">
                            {ev.estimate != null ? ev.estimate : '—'}
                          </td>
                          <td className="py-2.5 text-right">
                            <ValueCell actual={ev.actual} estimate={ev.estimate} label="actual" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Market() {
  const [quotes, setQuotes] = useState([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState('');
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadQuotes = useCallback(async () => {
    try {
      const data = await api.getQuotes();
      setQuotes(data);
      setQuotesError('');
    } catch (e) {
      setQuotesError(e.message);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    try {
      const data = await api.getCalendar();
      setNoKey(!!data.noKey);
      setCalData(data);
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    loadCalendar();
    setLastRefresh(new Date());
    // Auto-refresh quotes every 30s
    const interval = setInterval(() => loadQuotes(), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadQuotes(), loadCalendar()]);
    setLastRefresh(new Date());
    setRefreshing(false);
  }

  const TICKER_ORDER = ['NQ', 'MNQ', 'ES', 'GC', 'BTC'];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Market & News</h1>
          {lastRefresh && (
            <p className="text-xs text-slate-500 mt-0.5">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              · Prices auto-refresh every 30s
            </p>
          )}
        </div>
        <button className="btn-secondary" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Price tickers */}
      <div className="flex gap-3 flex-wrap">
        {TICKER_ORDER.map(label => (
          <TickerCard
            key={label}
            ticker={quotes.find(q => q.label === label)}
            loading={quotesLoading}
          />
        ))}
      </div>

      {quotesError && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          Could not load price data: {quotesError}
        </div>
      )}

      {/* Economic calendar */}
      <CalendarSection calData={calData} loading={calLoading} noKey={noKey} />
    </div>
  );
}
