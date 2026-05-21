import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, Download, Trash2, Edit2, ChevronUp, ChevronDown, ChevronsUpDown, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn, formatCurrency, formatDateTime, pnlClass, sessionColor, directionColor, formatR, formatPct } from '../lib/utils.js';
import TradeModal from '../components/TradeModal.jsx';
import DatePicker from '../components/DatePicker.jsx';

const SESSIONS = ['London', 'NY', 'Overnight'];
const DIRECTIONS = ['Long', 'Short'];
const INSTRUMENTS = ['NQ', 'MNQ', 'GC', 'MGC'];
const RATINGS = [1, 2, 3, 4, 5];

function SortIcon({ col, sort, order }) {
  if (sort !== col) return <ChevronsUpDown size={12} className="text-slate-600" />;
  return order === 'asc' ? <ChevronUp size={12} className="text-violet-400" /> : <ChevronDown size={12} className="text-violet-400" />;
}

function StarRating({ rating, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n === rating ? 0 : n)}
          className={cn('text-base transition-colors', n <= (hover || rating) ? 'text-yellow-400' : 'text-slate-700 hover:text-yellow-600')}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function TradeLog() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importFormat, setImportFormat] = useState('tradovate');
  const [importAccountId, setImportAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [setupTags, setSetupTags] = useState([]);
  const [filters, setFilters] = useState({
    start: '', end: '', account_id: '', instrument: '',
    direction: '', setup_tag_id: '', session: '', rating: '',
  });
  const [sort, setSort] = useState('date_time');
  const [order, setOrder] = useState('desc');
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesVal, setNotesVal] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    api.getAccounts().then(setAccounts);
    api.getTags('setup').then(setSetupTags);
  }, []);

  useEffect(() => {
    loadTrades();
  }, [filters, sort, order]);

  async function loadTrades() {
    setLoading(true);
    const params = { sort, order };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    try {
      const data = await api.getTrades(params);
      setTrades(data);
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(col) {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder('desc'); }
  }

  async function deleteTrade(id) {
    if (!confirm('Delete this trade?')) return;
    await api.deleteTrade(id);
    loadTrades();
  }

  async function saveNotes(trade) {
    await api.updateTrade(trade.id, { notes: notesVal });
    setEditingNotes(null);
    loadTrades();
  }

  async function saveRating(trade, rating) {
    await api.updateTrade(trade.id, { rating });
    loadTrades();
  }

  async function handleExport() {
    const blob = await api.exportTrades();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!importCsv.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.importTrades(importCsv, importFormat, importAccountId || null);
      setImportResult(result);
      if (result.imported > 0) loadTrades();
    } catch (e) {
      setImportResult({ imported: 0, errors: [{ error: e.message }] });
    } finally {
      setImporting(false);
    }
  }

  function handleFileRead(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportCsv(ev.target.result);
    reader.readAsText(file);
  }

  const hasFilters = Object.values(filters).some(v => v);

  const Th = ({ col, children }) => (
    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-slate-300 transition-colors"
      onClick={() => toggleSort(col)}>
      <span className="flex items-center gap-1">{children}<SortIcon col={col} sort={sort} order={order} /></span>
    </th>
  );

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Trade Log</h1>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Import CSV
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export
          </button>
          <button className="btn-primary" onClick={() => { setEditTrade(null); setShowModal(true); }}>
            <Plus size={15} /> Add Trade
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <DatePicker
            value={filters.start}
            onChange={v => setFilters(f => ({ ...f, start: v }))}
            placeholder="From"
          />
          <DatePicker
            value={filters.end}
            onChange={v => setFilters(f => ({ ...f, end: v }))}
            placeholder="To"
          />
          <select className="select w-36 py-1.5 text-xs" value={filters.account_id}
            onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select w-28 py-1.5 text-xs" value={filters.instrument}
            onChange={e => setFilters(f => ({ ...f, instrument: e.target.value }))}>
            <option value="">Instrument</option>
            {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <select className="select w-28 py-1.5 text-xs" value={filters.direction}
            onChange={e => setFilters(f => ({ ...f, direction: e.target.value }))}>
            <option value="">Direction</option>
            {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="select w-36 py-1.5 text-xs" value={filters.setup_tag_id}
            onChange={e => setFilters(f => ({ ...f, setup_tag_id: e.target.value }))}>
            <option value="">All Setups</option>
            {setupTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="select w-32 py-1.5 text-xs" value={filters.session}
            onChange={e => setFilters(f => ({ ...f, session: e.target.value }))}>
            <option value="">Session</option>
            {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select w-28 py-1.5 text-xs" value={filters.rating}
            onChange={e => setFilters(f => ({ ...f, rating: e.target.value }))}>
            <option value="">Rating</option>
            {RATINGS.map(r => <option key={r} value={r}>{'★'.repeat(r)}</option>)}
          </select>
          {hasFilters && (
            <button className="btn-ghost py-1.5 text-xs" onClick={() => setFilters({ start: '', end: '', account_id: '', instrument: '', direction: '', setup_tag_id: '', session: '', rating: '' })}>
              <X size={12} /> Clear
            </button>
          )}
          <span className="text-xs text-slate-500 ml-auto">{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1400px]">
            <thead className="bg-surface-3 border-b border-border">
              <tr>
                <Th col="date_time">Date / Time</Th>
                <Th col="instrument">Instr</Th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Account</th>
                <Th col="direction">Dir</Th>
                <Th col="entry_price">Entry</Th>
                <Th col="exit_price">Exit</Th>
                <Th col="contracts">Qty</Th>
                <Th col="gross_pnl">Gross</Th>
                <Th col="commission">Comm</Th>
                <Th col="net_pnl">Net P&L</Th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Setup</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Confluence</th>
                <Th col="r_multiple">R</Th>
                <Th col="session">Session</Th>
                <Th col="rating">Rating</Th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-3">
              {loading && (
                <tr><td colSpan={17} className="text-center text-slate-500 py-8">Loading…</td></tr>
              )}
              {!loading && trades.length === 0 && (
                <tr><td colSpan={17} className="text-center text-slate-500 py-12">
                  No trades found. <button className="text-violet-400 hover:underline" onClick={() => setShowModal(true)}>Add your first trade</button>
                </td></tr>
              )}
              {trades.map(trade => (
                <tr key={trade.id} className="table-row-hover group">
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-300">
                    {formatDateTime(trade.date_time)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('badge', trade.instrument === 'NQ' ? 'bg-violet-900/40 text-violet-300' : 'bg-blue-900/40 text-blue-300')}>
                      {trade.instrument}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{trade.account?.name || '—'}</td>
                  <td className={cn('px-3 py-2.5 font-medium', directionColor(trade.direction))}>{trade.direction}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{trade.entry_price ? trade.entry_price.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{trade.exit_price ? trade.exit_price.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{trade.contracts}</td>
                  <td className={cn('px-3 py-2.5 font-mono', pnlClass(trade.gross_pnl))}>{formatCurrency(trade.gross_pnl)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{formatCurrency(trade.commission, false)}</td>
                  <td className={cn('px-3 py-2.5 font-mono font-semibold', pnlClass(trade.net_pnl))}>
                    {formatCurrency(trade.net_pnl)}
                  </td>
                  <td className="px-3 py-2.5">
                    {trade.setupTag && (
                      <span className="badge bg-violet-900/30 text-violet-300 border border-violet-800/40">
                        {trade.setupTag.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 max-w-[140px]">
                    <div className="flex flex-wrap gap-1">
                      {trade.confluenceTags?.slice(0, 2).map(t => (
                        <span key={t.id} className="badge bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 text-[10px]">
                          {t.name}
                        </span>
                      ))}
                      {(trade.confluenceTags?.length || 0) > 2 && (
                        <span className="badge bg-surface-3 text-slate-500 text-[10px]">+{trade.confluenceTags.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className={cn('px-3 py-2.5 font-mono', pnlClass(trade.r_multiple))}>
                    {formatR(trade.r_multiple)}
                  </td>
                  <td className="px-3 py-2.5">
                    {trade.session && <span className={cn('badge', sessionColor(trade.session))}>{trade.session}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <StarRating rating={trade.rating || 0} onChange={(r) => saveRating(trade, r)} />
                  </td>
                  <td className="px-3 py-2.5 max-w-[160px]">
                    {editingNotes === trade.id ? (
                      <div className="flex gap-1">
                        <input className="input py-1 text-xs flex-1" value={notesVal}
                          onChange={e => setNotesVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveNotes(trade); if (e.key === 'Escape') setEditingNotes(null); }}
                          autoFocus />
                        <button className="btn-ghost p-1" onClick={() => saveNotes(trade)}>✓</button>
                        <button className="btn-ghost p-1" onClick={() => setEditingNotes(null)}>✕</button>
                      </div>
                    ) : (
                      <span className="text-slate-400 cursor-text hover:text-slate-200 transition-colors truncate block"
                        onClick={() => { setEditingNotes(trade.id); setNotesVal(trade.notes || ''); }}>
                        {trade.notes || <span className="text-slate-600 italic">click to add</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="btn-ghost p-1.5 rounded" onClick={() => { setEditTrade(trade); setShowModal(true); }}>
                        <Edit2 size={13} />
                      </button>
                      <button className="btn-danger p-1.5 rounded" onClick={() => deleteTrade(trade.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade Modal */}
      {showModal && (
        <TradeModal
          trade={editTrade}
          onClose={() => { setShowModal(false); setEditTrade(null); }}
          onSaved={loadTrades}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-2 border border-border rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-slate-100">Import Trades (CSV)</h2>
              <button onClick={() => { setShowImport(false); setImportResult(null); setImportCsv(''); setImportAccountId(''); }} className="btn-ghost p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Format</label>
                  <select className="select w-40" value={importFormat} onChange={e => setImportFormat(e.target.value)}>
                    <option value="tradovate">Tradovate</option>
                    <option value="rithmic">Rithmic</option>
                    <option value="manual">Manual / Generic</option>
                  </select>
                </div>
                <div>
                  <label className="label">Account</label>
                  <select className="select w-40" value={importAccountId} onChange={e => setImportAccountId(e.target.value)}>
                    <option value="">— None —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex-1" />
                <div>
                  <input type="file" accept=".csv" ref={fileRef} onChange={handleFileRead} className="hidden" />
                  <button className="btn-secondary" onClick={() => fileRef.current.click()}>
                    <Upload size={14} /> Load CSV File
                  </button>
                </div>
              </div>
              {importFormat === 'tradovate' && (
                <div className="bg-surface-3 border border-border rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <p className="text-slate-300 font-medium mb-1">How to export from Tradovate:</p>
                  <p>1. Log in → click <span className="text-slate-200">Performance</span> in the left sidebar (or bottom panel)</p>
                  <p>2. Set your <span className="text-slate-200">date range</span> → click <span className="text-slate-200">Export CSV</span></p>
                  <p>3. The file will be named something like <span className="text-slate-200">Performance-may-2026.csv</span></p>
                  <p className="text-slate-500 pt-1">Expected columns: symbol, qty, buyPrice, sellPrice, pnl, boughtTimestamp, soldTimestamp</p>
                  <p className="text-slate-500">Direction and entry/exit prices are auto-detected from timestamps.</p>
                </div>
              )}
              <div>
                <label className="label">CSV Content</label>
                <textarea className="input h-40 font-mono text-xs resize-none" placeholder="Paste CSV here or load file above..."
                  value={importCsv} onChange={e => setImportCsv(e.target.value)} />
              </div>
              {importResult && (
                <div className={cn('p-3 rounded-lg text-sm', importResult.imported > 0 ? 'bg-emerald-900/30 text-emerald-300' : importResult.skipped > 0 ? 'bg-surface-3 text-slate-400' : 'bg-red-900/30 text-red-300')}>
                  {importResult.imported > 0 && <p>Imported {importResult.imported} trade(s).</p>}
                  {importResult.skipped > 0 && <p className="text-slate-400">{importResult.skipped} already imported — skipped.</p>}
                  {importResult.imported === 0 && importResult.skipped === 0 && <p>No trades imported.</p>}
                  {importResult.errors?.length > 0 && (
                    <div className="text-xs text-red-400 mt-1 space-y-0.5">
                      {importResult.errors.slice(0, 5).map((e, i) => (
                        <p key={i}>Row {e.row}: {e.error}</p>
                      ))}
                      {importResult.errors.length > 5 && <p>…and {importResult.errors.length - 5} more</p>}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <button className="btn-secondary" onClick={() => { setShowImport(false); setImportResult(null); setImportCsv(''); setImportAccountId(''); }}>Cancel</button>
                <button className="btn-primary" onClick={handleImport} disabled={importing || !importCsv.trim()}>
                  {importing ? 'Importing…' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
