import { useState, useEffect, useCallback } from 'react';
import { X, Star, ChevronDown } from 'lucide-react';
import { cn, calcGrossPnL, calcCommission, calcRMultiple, formatCurrency } from '../lib/utils.js';
import { api } from '../lib/api.js';

const EMPTY_FORM = {
  date_time: '',
  instrument: 'MNQ',
  account_id: '',
  direction: 'Long',
  entry_price: '',
  exit_price: '',
  contracts: '1',
  commission: '',
  gross_pnl: '',
  net_pnl: '',
  setup_tag_id: '',
  confluence_tag_ids: [],
  planned_sl_ticks: '',
  planned_tp_ticks: '',
  actual_sl_hit: false,
  r_multiple: '',
  rating: 0,
  mistake_tag_ids: [],
  notes: '',
  screenshot: '',
};

function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export default function TradeModal({ trade, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [accounts, setAccounts] = useState([]);
  const [setupTags, setSetupTags] = useState([]);
  const [confluenceTags, setConfluenceTags] = useState([]);
  const [mistakeTags, setMistakeTags] = useState([]);
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [manualCommission, setManualCommission] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getAccounts(),
      api.getTags('setup'),
      api.getTags('confluence'),
      api.getTags('mistake'),
      api.getSettings(),
    ]).then(([accs, setup, conf, mistakes, setts]) => {
      setAccounts(accs);
      setSetupTags(setup);
      setConfluenceTags(conf);
      setMistakeTags(mistakes);
      setSettings(setts);
    });
  }, []);

  useEffect(() => {
    if (trade) {
      setForm({
        date_time: trade.date_time?.slice(0, 16) || nowLocal(),
        instrument: trade.instrument || 'MNQ',
        account_id: trade.account_id || '',
        direction: trade.direction || 'Long',
        entry_price: trade.entry_price || '',
        exit_price: trade.exit_price || '',
        contracts: trade.contracts ?? '1',
        commission: trade.commission ?? '',
        gross_pnl: trade.gross_pnl ?? '',
        net_pnl: trade.net_pnl ?? '',
        setup_tag_id: trade.setup_tag_id || '',
        confluence_tag_ids: trade.confluenceTags?.map(t => t.id) || [],
        planned_sl_ticks: trade.planned_sl_ticks ?? '',
        planned_tp_ticks: trade.planned_tp_ticks ?? '',
        actual_sl_hit: !!trade.actual_sl_hit,
        r_multiple: trade.r_multiple ?? '',
        rating: trade.rating || 0,
        mistake_tag_ids: trade.mistakeTags?.map(t => t.id) || [],
        notes: trade.notes || '',
        screenshot: trade.screenshot || '',
      });
      setManualCommission(false);
    } else {
      setForm({ ...EMPTY_FORM, date_time: nowLocal() });
      setManualCommission(false);
    }
  }, [trade]);

  // Auto-calculate from prices when both are provided
  useEffect(() => {
    const ep = parseFloat(form.entry_price);
    const xp = parseFloat(form.exit_price);
    const c = parseInt(form.contracts) || 1;
    if (!isNaN(ep) && !isNaN(xp) && ep !== 0 && form.instrument && form.direction) {
      const gross = calcGrossPnL(form.instrument, form.direction, ep, xp, c);
      const comm = manualCommission && form.commission !== ''
        ? parseFloat(form.commission)
        : calcCommission(form.instrument, c, settings);
      const net = +(gross - comm).toFixed(2);
      const sl = parseInt(form.planned_sl_ticks) || 0;
      const r = calcRMultiple(net, sl, form.instrument, c, settings);
      setForm(prev => ({
        ...prev,
        gross_pnl: gross,
        commission: manualCommission ? prev.commission : comm,
        net_pnl: net,
        r_multiple: r ?? '',
      }));
    }
  }, [form.entry_price, form.exit_price, form.contracts, form.direction,
    form.instrument, form.planned_sl_ticks, settings]);

  // Recalc net/R when gross P&L is manually entered (price-free mode)
  useEffect(() => {
    if (form.entry_price !== '' || form.exit_price !== '') return;
    if (form.gross_pnl === '' || isNaN(parseFloat(form.gross_pnl))) return;
    const c = parseInt(form.contracts) || 1;
    const comm = manualCommission && form.commission !== ''
      ? parseFloat(form.commission)
      : calcCommission(form.instrument, c, settings);
    const net = +(parseFloat(form.gross_pnl) - comm).toFixed(2);
    const sl = parseInt(form.planned_sl_ticks) || 0;
    const r = calcRMultiple(net, sl, form.instrument, c, settings);
    setForm(prev => ({ ...prev, commission: manualCommission ? prev.commission : comm, net_pnl: net, r_multiple: r ?? '' }));
  }, [form.gross_pnl, form.entry_price, form.exit_price, form.contracts, form.instrument, form.planned_sl_ticks, settings]);

  // Recalc net when commission manually changed
  useEffect(() => {
    if (manualCommission && form.commission !== '' && form.gross_pnl !== '') {
      const net = +(parseFloat(form.gross_pnl) - parseFloat(form.commission)).toFixed(2);
      const c = parseInt(form.contracts) || 1;
      const sl = parseInt(form.planned_sl_ticks) || 0;
      const r = calcRMultiple(net, sl, form.instrument, c, settings);
      setForm(prev => ({ ...prev, net_pnl: net, r_multiple: r ?? '' }));
    }
  }, [form.commission]);

  const set = useCallback((key, val) => setForm(prev => ({ ...prev, [key]: val })), []);

  function toggleMulti(key, id) {
    setForm(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        entry_price: form.entry_price !== '' ? parseFloat(form.entry_price) : 0,
        exit_price: form.exit_price !== '' ? parseFloat(form.exit_price) : 0,
        gross_pnl: form.gross_pnl !== '' ? parseFloat(form.gross_pnl) : null,
        contracts: parseInt(form.contracts) || 1,
        account_id: form.account_id || null,
        setup_tag_id: form.setup_tag_id || null,
        planned_sl_ticks: parseInt(form.planned_sl_ticks) || null,
        planned_tp_ticks: parseInt(form.planned_tp_ticks) || null,
        commission: parseFloat(form.commission) || null,
        rating: form.rating || null,
        actual_sl_hit: form.actual_sl_hit ? 1 : 0,
        confluence_tag_ids: form.confluence_tag_ids,
        mistake_tag_ids: form.mistake_tag_ids,
      };
      if (trade?.id) {
        await api.updateTrade(trade.id, payload);
      } else {
        await api.createTrade(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-2 border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-surface-2 border-b border-border flex items-center justify-between px-6 py-4 z-10">
          <h2 className="text-lg font-semibold text-slate-100">
            {trade?.id ? 'Edit Trade' : 'New Trade'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Row 1: Date, Instrument, Account, Direction */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="label">Date & Time</label>
              <input type="datetime-local" className="input" value={form.date_time}
                onChange={e => set('date_time', e.target.value)} required />
            </div>
            <div>
              <label className="label">Instrument</label>
              <select className="select" value={form.instrument} onChange={e => set('instrument', e.target.value)}>
                <option value="MNQ">MNQ</option>
                <option value="NQ">NQ</option>
                <option value="MGC">MGC</option>
                <option value="GC">GC</option>
              </select>
            </div>
            <div>
              <label className="label">Account</label>
              <select className="select" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
                <option value="">— None —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Direction</label>
              <div className="flex gap-2">
                {['Long', 'Short'].map(d => (
                  <button key={d} type="button"
                    onClick={() => set('direction', d)}
                    className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                      form.direction === d
                        ? d === 'Long'
                          ? 'bg-profit/20 text-profit border-profit/40'
                          : 'bg-loss/20 text-loss border-loss/40'
                        : 'bg-surface-1 text-slate-400 border-border hover:border-slate-500')}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Prices and Contracts */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Entry Price <span className="text-slate-600 font-normal">(optional)</span></label>
              <input type="number" step="0.25" className="input font-mono" placeholder="leave blank to enter $ P&L"
                value={form.entry_price} onChange={e => set('entry_price', e.target.value)} />
            </div>
            <div>
              <label className="label">Exit Price <span className="text-slate-600 font-normal">(optional)</span></label>
              <input type="number" step="0.25" className="input font-mono" placeholder="leave blank to enter $ P&L"
                value={form.exit_price} onChange={e => set('exit_price', e.target.value)} />
            </div>
            <div>
              <label className="label">Contracts</label>
              <input type="number" min="1" className="input font-mono" placeholder="1"
                value={form.contracts} onChange={e => set('contracts', e.target.value)} required />
            </div>
          </div>

          {/* Row 3: P&L display */}
          {(() => {
            const noPrices = form.entry_price === '' && form.exit_price === '';
            return (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">
                Gross P&L
                {noPrices && <span className="text-violet-400 text-xs ml-1">— enter directly</span>}
              </label>
              {noPrices ? (
                <input type="number" step="0.01" className={cn('input font-mono',
                  form.gross_pnl === '' ? 'text-slate-400' : parseFloat(form.gross_pnl) >= 0 ? 'text-profit' : 'text-loss')}
                  placeholder="0.00" value={form.gross_pnl}
                  onChange={e => set('gross_pnl', e.target.value)} />
              ) : (
              <div className={cn('input font-mono cursor-default', form.gross_pnl === '' ? 'text-slate-500' :
                form.gross_pnl >= 0 ? 'text-profit' : 'text-loss')}>
                {form.gross_pnl !== '' ? formatCurrency(form.gross_pnl) : '—'}
              </div>
              )}
            </div>
            <div>
              <label className="label flex justify-between">
                Commission
                <button type="button" onClick={() => setManualCommission(v => !v)}
                  className={cn('text-xs', manualCommission ? 'text-violet-400' : 'text-slate-500 hover:text-slate-400')}>
                  {manualCommission ? 'auto off' : 'override'}
                </button>
              </label>
              <input type="number" step="0.01" className="input font-mono"
                value={form.commission} readOnly={!manualCommission}
                onChange={e => set('commission', e.target.value)}
                style={{ opacity: manualCommission ? 1 : 0.7 }} />
            </div>
            <div>
              <label className="label">Net P&L</label>
              <div className={cn('input font-mono cursor-default', form.net_pnl === '' ? 'text-slate-500' :
                form.net_pnl >= 0 ? 'text-profit' : 'text-loss')}>
                {form.net_pnl !== '' ? formatCurrency(form.net_pnl) : '—'}
              </div>
            </div>
          </div>
            );
          })()}

          {/* Row 4: Setup, SL/TP, R */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="label">Setup Tag</label>
              <select className="select" value={form.setup_tag_id} onChange={e => set('setup_tag_id', e.target.value)}>
                <option value="">— None —</option>
                {setupTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Planned SL (ticks)</label>
              <input type="number" min="0" className="input font-mono" placeholder="0"
                value={form.planned_sl_ticks} onChange={e => set('planned_sl_ticks', e.target.value)} />
            </div>
            <div>
              <label className="label">Planned TP (ticks)</label>
              <input type="number" min="0" className="input font-mono" placeholder="0"
                value={form.planned_tp_ticks} onChange={e => set('planned_tp_ticks', e.target.value)} />
            </div>
          </div>

          {/* Row 5: R-multiple, Actual SL hit */}
          <div className="grid grid-cols-3 gap-4 items-end">
            <div>
              <label className="label">R-Multiple</label>
              <div className={cn('input font-mono cursor-default',
                form.r_multiple === '' || form.r_multiple == null ? 'text-slate-500' :
                  form.r_multiple >= 0 ? 'text-profit' : 'text-loss')}>
                {form.r_multiple != null && form.r_multiple !== ''
                  ? `${form.r_multiple >= 0 ? '+' : ''}${Number(form.r_multiple).toFixed(2)}R`
                  : '—'}
              </div>
            </div>
            <div className="flex items-center gap-3 pb-2">
              <label className="relative inline-flex items-center cursor-pointer gap-3">
                <input type="checkbox" className="sr-only peer" checked={form.actual_sl_hit}
                  onChange={e => set('actual_sl_hit', e.target.checked)} />
                <div className="w-10 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer
                  peer-checked:bg-violet-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                  after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all
                  peer-checked:after:translate-x-5 border border-border"></div>
                <span className="text-sm text-slate-400">SL was hit</span>
              </label>
            </div>
            <div>
              <label className="label">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => set('rating', form.rating === n ? 0 : n)}
                    className={cn('text-xl transition-colors', n <= form.rating ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-600')}>
                    ★
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Confluence Tags */}
          <div>
            <label className="label">Confluence Tags</label>
            <div className="flex flex-wrap gap-2">
              {confluenceTags.map(t => (
                <button key={t.id} type="button"
                  onClick={() => toggleMulti('confluence_tag_ids', t.id)}
                  className={cn('badge transition-all border',
                    form.confluence_tag_ids.includes(t.id)
                      ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60'
                      : 'bg-surface-3 text-slate-400 border-border hover:border-slate-500')}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Mistake Tags */}
          <div>
            <label className="label">Mistakes</label>
            <div className="flex flex-wrap gap-2">
              {mistakeTags.map(t => (
                <button key={t.id} type="button"
                  onClick={() => toggleMulti('mistake_tag_ids', t.id)}
                  className={cn('badge transition-all border',
                    form.mistake_tag_ids.includes(t.id)
                      ? 'bg-red-900/50 text-red-300 border-red-700/60'
                      : 'bg-surface-3 text-slate-400 border-border hover:border-slate-500')}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Notes + Screenshot */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none h-20" placeholder="Trade notes..."
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div>
              <label className="label">Screenshot (URL or path)</label>
              <input type="text" className="input" placeholder="https://... or /path/to/screenshot.png"
                value={form.screenshot} onChange={e => set('screenshot', e.target.value)} />
            </div>
          </div>

          {error && <p className="text-loss text-sm">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : trade?.id ? 'Save Changes' : 'Add Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
