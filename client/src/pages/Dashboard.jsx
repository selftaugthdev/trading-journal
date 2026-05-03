import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { api } from '../lib/api.js';
import { formatCurrency, formatPct, formatR, pnlClass } from '../lib/utils.js';
import DatePicker from '../components/DatePicker.jsx';

const VIOLET = '#8B5CF6';
const GREEN = '#10B981';
const RED = '#EF4444';
const MUTED = '#4B5563';

function MetricCard({ label, value, sub, valueClass = 'text-slate-100' }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className={`metric-value ${valueClass}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">{children}</h3>;
}

const CustomTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: {prefix}{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{suffix}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [filters, setFilters] = useState({ start: '', end: '', account_id: '' });
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [equity, setEquity] = useState([]);
  const [daily, setDaily] = useState([]);
  const [bySession, setBySession] = useState([]);
  const [byWeekday, setByWeekday] = useState([]);
  const [bySetup, setBySetup] = useState([]);
  const [byConfluence, setByConfluence] = useState([]);
  const [byAccount, setByAccount] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [rDist, setRDist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    const params = {};
    if (filters.start) params.start = filters.start;
    if (filters.end) params.end = filters.end;
    if (filters.account_id) params.account_id = filters.account_id;

    setLoading(true);
    Promise.all([
      api.getSummary(params),
      api.getEquity(params),
      api.getDaily(params),
      api.getBySession(params),
      api.getByWeekday(params),
      api.getBySetup(params),
      api.getByConfluence(params),
      api.getByAccount(params),
      api.getMistakes(params),
      api.getRDistribution(params),
    ]).then(([sum, eq, d, sess, wd, setup, conf, acc, mis, rd]) => {
      setSummary(sum);
      setEquity(eq);
      setDaily(d);
      setBySession(sess);
      setByWeekday(wd);
      setBySetup(setup);
      setByConfluence(conf);
      setByAccount(acc);
      setMistakes(mis);
      setRDist(rd);
    }).finally(() => setLoading(false));
  }, [filters]);

  const pnlColor = (v) => v >= 0 ? GREEN : RED;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <div className="flex items-center gap-3">
          <select className="select w-36" value={filters.account_id}
            onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <DatePicker
            value={filters.start}
            onChange={v => setFilters(f => ({ ...f, start: v }))}
            placeholder="From"
          />
          <span className="text-slate-500 text-sm">to</span>
          <DatePicker
            value={filters.end}
            onChange={v => setFilters(f => ({ ...f, end: v }))}
            placeholder="To"
          />
          {(filters.start || filters.end || filters.account_id) && (
            <button className="btn-ghost text-xs" onClick={() => setFilters({ start: '', end: '', account_id: '' })}>
              Clear
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-slate-500 text-sm text-center py-8">Loading analytics…</div>}

      {!loading && !summary && (
        <div className="card text-center py-12 text-slate-500">
          No trades found. Add your first trade in the Trade Log.
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="col-span-2">
              <MetricCard
                label="Net P&L"
                value={formatCurrency(summary.total_net_pnl)}
                valueClass={summary.total_net_pnl >= 0 ? 'text-profit text-2xl' : 'text-loss text-2xl'}
              />
            </div>
            <MetricCard label="Win Rate" value={formatPct(summary.win_rate)} />
            <MetricCard label="Profit Factor" value={summary.profit_factor?.toFixed(2) ?? '—'} />
            <MetricCard label="Avg Win" value={formatCurrency(summary.avg_win)} valueClass="text-profit" />
            <MetricCard label="Avg Loss" value={formatCurrency(summary.avg_loss)} valueClass="text-loss" />
            <MetricCard label="Avg R" value={formatR(summary.avg_r_multiple)} />
            <MetricCard label="Max Drawdown" value={formatCurrency(summary.max_drawdown, false)} valueClass="text-loss" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Total Trades" value={summary.total_trades} />
            <MetricCard label="Expectancy" value={formatR(summary.expectancy)} />
          </div>

          {/* Equity Curve */}
          <div className="card">
            <SectionTitle>Cumulative Equity Curve</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={equity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C1C2A" />
                <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} tickFormatter={v => `$${v}`} width={70} />
                <Tooltip content={<CustomTooltip prefix="$" />} />
                <ReferenceLine y={0} stroke="#2A2A40" />
                <Line type="monotone" dataKey="cumPnL" name="Equity" stroke={VIOLET} strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: VIOLET }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Daily P&L + R Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <SectionTitle>Daily P&L</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C1C2A" />
                  <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} tickFormatter={v => `$${v}`} width={65} />
                  <Tooltip content={<CustomTooltip prefix="$" />} />
                  <ReferenceLine y={0} stroke="#2A2A40" />
                  <Bar dataKey="net_pnl" name="Net P&L" radius={[3, 3, 0, 0]}>
                    {daily.map((d, i) => <Cell key={i} fill={pnlColor(d.net_pnl)} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <SectionTitle>R-Multiple Distribution</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C1C2A" />
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip suffix=" trades" />} />
                  <Bar dataKey="count" name="Trades" radius={[3, 3, 0, 0]}>
                    {rDist.map((d, i) => {
                      const isPos = d.label.startsWith('0') || d.label.startsWith('1') || d.label.startsWith('2') || d.label.startsWith('>');
                      return <Cell key={i} fill={isPos ? GREEN : RED} fillOpacity={0.8} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Session + Weekday */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <SectionTitle>P&L by Session</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bySession}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C1C2A" />
                  <XAxis dataKey="session" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} tickFormatter={v => `$${v}`} width={65} />
                  <Tooltip content={<CustomTooltip prefix="$" />} />
                  <ReferenceLine y={0} stroke="#2A2A40" />
                  <Bar dataKey="net_pnl" name="Net P&L" radius={[3, 3, 0, 0]}>
                    {bySession.map((d, i) => <Cell key={i} fill={pnlColor(d.net_pnl)} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <SectionTitle>P&L by Day of Week</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byWeekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C1C2A" />
                  <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} tickFormatter={v => `$${v}`} width={65} />
                  <Tooltip content={<CustomTooltip prefix="$" />} />
                  <ReferenceLine y={0} stroke="#2A2A40" />
                  <Bar dataKey="net_pnl" name="Net P&L" radius={[3, 3, 0, 0]}>
                    {byWeekday.map((d, i) => <Cell key={i} fill={pnlColor(d.net_pnl)} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* P&L by Setup + Confluence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <SectionTitle>P&L by Setup Tag</SectionTitle>
              {bySetup.length === 0 ? <p className="text-slate-500 text-sm">No data</p> : (
                <div className="space-y-2">
                  {bySetup.map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-slate-400 truncate">{s.name}</div>
                      <div className="flex-1 h-6 bg-surface-3 rounded overflow-hidden">
                        <div className="h-full rounded transition-all"
                          style={{
                            width: `${Math.min(100, Math.abs(s.net_pnl) / Math.max(...bySetup.map(x => Math.abs(x.net_pnl))) * 100)}%`,
                            backgroundColor: s.net_pnl >= 0 ? GREEN : RED,
                            opacity: 0.8,
                          }} />
                      </div>
                      <div className={`text-xs font-mono w-20 text-right ${s.net_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {formatCurrency(s.net_pnl)}
                      </div>
                      <div className="text-xs text-slate-500 w-12 text-right">{formatPct(s.win_rate)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <SectionTitle>P&L by Confluence Tag</SectionTitle>
              {byConfluence.length === 0 ? <p className="text-slate-500 text-sm">No data</p> : (
                <div className="space-y-2">
                  {byConfluence.map(c => (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-slate-400 truncate">{c.name}</div>
                      <div className="flex-1 h-6 bg-surface-3 rounded overflow-hidden">
                        <div className="h-full rounded"
                          style={{
                            width: `${Math.min(100, Math.abs(c.net_pnl) / Math.max(...byConfluence.map(x => Math.abs(x.net_pnl))) * 100)}%`,
                            backgroundColor: c.net_pnl >= 0 ? GREEN : RED,
                            opacity: 0.8,
                          }} />
                      </div>
                      <div className={`text-xs font-mono w-20 text-right ${c.net_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {formatCurrency(c.net_pnl)}
                      </div>
                      <div className="text-xs text-slate-500 w-12 text-right">{formatPct(c.win_rate)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* By Setup */}
            <div className="card">
              <SectionTitle>Setup Breakdown</SectionTitle>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-border">
                    <th className="text-left pb-2">Setup</th>
                    <th className="text-right pb-2">#</th>
                    <th className="text-right pb-2">WR%</th>
                    <th className="text-right pb-2">Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {bySetup.map(s => (
                    <tr key={s.id} className="border-b border-surface-3">
                      <td className="py-1.5 text-slate-300">{s.name}</td>
                      <td className="text-right text-slate-400">{s.trade_count}</td>
                      <td className="text-right text-slate-400">{formatPct(s.win_rate)}</td>
                      <td className={`text-right font-mono ${s.net_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(s.net_pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* By Mistake */}
            <div className="card">
              <SectionTitle>Mistake Cost</SectionTitle>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-border">
                    <th className="text-left pb-2">Mistake</th>
                    <th className="text-right pb-2">Count</th>
                    <th className="text-right pb-2">P&L Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {mistakes.map(m => (
                    <tr key={m.id} className="border-b border-surface-3">
                      <td className="py-1.5 text-slate-300">{m.name}</td>
                      <td className="text-right text-slate-400">{m.frequency}</td>
                      <td className={`text-right font-mono ${m.total_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(m.total_pnl)}</td>
                    </tr>
                  ))}
                  {mistakes.length === 0 && <tr><td colSpan={3} className="text-slate-500 py-2">No mistakes logged</td></tr>}
                </tbody>
              </table>
            </div>

            {/* By Account */}
            <div className="card">
              <SectionTitle>By Account</SectionTitle>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-border">
                    <th className="text-left pb-2">Account</th>
                    <th className="text-right pb-2">#</th>
                    <th className="text-right pb-2">WR%</th>
                    <th className="text-right pb-2">Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {byAccount.map(a => (
                    <tr key={a.id} className="border-b border-surface-3">
                      <td className="py-1.5 text-slate-300">{a.name}</td>
                      <td className="text-right text-slate-400">{a.trade_count}</td>
                      <td className="text-right text-slate-400">{formatPct(a.win_rate)}</td>
                      <td className={`text-right font-mono ${a.net_pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(a.net_pnl)}</td>
                    </tr>
                  ))}
                  {byAccount.length === 0 && <tr><td colSpan={4} className="text-slate-500 py-2">No account data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
