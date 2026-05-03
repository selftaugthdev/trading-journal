import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Save, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

const TAG_TYPES = [
  { key: 'setup', label: 'Setup Tags', desc: 'Trade setups (e.g., ICT IFVG, OB Rejection)' },
  { key: 'confluence', label: 'Confluence Tags', desc: 'Supporting factors (e.g., Kill Zone, GEX Wall)' },
  { key: 'mistake', label: 'Mistake Tags', desc: 'Trading errors (e.g., FOMO Entry, Moved SL)' },
];

const TAG_COLORS = ['#8B5CF6', '#7C3AED', '#10B981', '#059669', '#EF4444', '#F97316', '#F59E0B', '#3B82F6', '#06B6D4', '#EC4899'];

function TagRow({ tag, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color || '#8B5CF6');

  async function save() {
    await onUpdate(tag.id, { name, color });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <input className="input py-1.5 text-xs flex-1" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} autoFocus />
        <div className="flex gap-1">
          {TAG_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={cn('w-5 h-5 rounded-full border-2 transition-all', color === c ? 'border-white scale-110' : 'border-transparent')}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <button className="btn-ghost p-1.5 rounded text-profit" onClick={save}><Check size={14} /></button>
        <button className="btn-ghost p-1.5 rounded" onClick={() => setEditing(false)}><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-2 group">
      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#8B5CF6' }} />
      <span className="text-sm text-slate-300 flex-1">{tag.name}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="btn-ghost p-1.5 rounded" onClick={() => setEditing(true)}><Edit2 size={12} /></button>
        <button className="btn-danger p-1.5 rounded" onClick={() => onDelete(tag.id)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function TagSection({ type, label, desc }) {
  const [tags, setTags] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#8B5CF6');

  useEffect(() => { load(); }, [type]);

  async function load() {
    const data = await api.getTags(type);
    setTags(data);
  }

  async function addTag() {
    if (!newName.trim()) return;
    await api.createTag({ name: newName.trim(), type, color: newColor });
    setNewName('');
    setAdding(false);
    load();
  }

  async function deleteTag(id) {
    if (!confirm('Delete this tag?')) return;
    await api.deleteTag(id);
    load();
  }

  async function updateTag(id, data) {
    await api.updateTag(id, data);
    load();
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-200">{label}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
        <button className="btn-secondary py-1.5 text-xs" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add
        </button>
      </div>

      <div className="divide-y divide-surface-3">
        {tags.map(t => (
          <TagRow key={t.id} tag={t} onDelete={deleteTag} onUpdate={updateTag} />
        ))}
        {tags.length === 0 && !adding && (
          <p className="text-slate-500 text-sm py-2">No tags yet.</p>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <input className="input py-1.5 text-xs flex-1" value={newName} placeholder="Tag name..."
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
            autoFocus />
          <div className="flex gap-1">
            {TAG_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                className={cn('w-5 h-5 rounded-full border-2 transition-all', newColor === c ? 'border-white scale-110' : 'border-transparent')}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <button className="btn-ghost p-1.5 rounded text-profit" onClick={addTag}><Check size={14} /></button>
          <button className="btn-ghost p-1.5 rounded" onClick={() => { setAdding(false); setNewName(''); }}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function AccountRow({ account, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(account.starting_balance);

  async function save() {
    await onUpdate(account.id, { name, starting_balance: parseFloat(balance) || 0 });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-surface-3">
        <td className="px-3 py-2">
          <input className="input py-1 text-xs" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </td>
        <td className="px-3 py-2">
          <input type="number" className="input py-1 text-xs font-mono" value={balance} onChange={e => setBalance(e.target.value)} />
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-1">
            <button className="btn-ghost p-1.5 rounded text-profit" onClick={save}><Check size={14} /></button>
            <button className="btn-ghost p-1.5 rounded" onClick={() => setEditing(false)}><X size={14} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-surface-3 group">
      <td className="px-3 py-2.5 text-sm text-slate-300">{account.name}</td>
      <td className="px-3 py-2.5 text-sm font-mono text-slate-400">
        ${Number(account.starting_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="btn-ghost p-1.5 rounded" onClick={() => setEditing(true)}><Edit2 size={12} /></button>
          <button className="btn-danger p-1.5 rounded" onClick={() => onDelete(account.id)}><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  );
}

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);
  const [settings, setSettings] = useState({
    commission_nq: '4.20',
    commission_mnq: '2.10',
    tick_value_nq: '5',
    tick_value_mnq: '0.50',
    csv_format: 'manual',
    finnhub_api_key: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    loadAccounts();
    api.getSettings().then(s => setSettings(prev => ({ ...prev, ...s })));
  }, []);

  async function loadAccounts() {
    const data = await api.getAccounts();
    setAccounts(data);
  }

  async function addAccount() {
    if (!newAccountName.trim()) return;
    await api.createAccount({ name: newAccountName.trim(), starting_balance: parseFloat(newAccountBalance) || 0 });
    setNewAccountName('');
    setNewAccountBalance('');
    setAddingAccount(false);
    loadAccounts();
  }

  async function deleteAccount(id) {
    if (!confirm('Delete this account? Trades linked to it will lose the account reference.')) return;
    await api.deleteAccount(id);
    loadAccounts();
  }

  async function updateAccount(id, data) {
    await api.updateAccount(id, data);
    loadAccounts();
  }

  async function saveSettings() {
    await api.updateSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-100">Settings</h1>

      {/* Account Management */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">Accounts</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage your trading accounts</p>
          </div>
          <button className="btn-secondary py-1.5 text-xs" onClick={() => setAddingAccount(true)}>
            <Plus size={13} /> Add Account
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 pb-2 text-xs font-medium text-slate-500">Account Name</th>
              <th className="px-3 pb-2 text-xs font-medium text-slate-500">Starting Balance</th>
              <th className="px-3 pb-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <AccountRow key={a.id} account={a} onDelete={deleteAccount} onUpdate={updateAccount} />
            ))}
          </tbody>
        </table>

        {addingAccount && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <input className="input py-1.5 text-sm flex-1" value={newAccountName} placeholder="Account name..."
              onChange={e => setNewAccountName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addAccount(); if (e.key === 'Escape') setAddingAccount(false); }}
              autoFocus />
            <input type="number" className="input py-1.5 text-sm w-36 font-mono" value={newAccountBalance}
              placeholder="Starting balance" onChange={e => setNewAccountBalance(e.target.value)} />
            <button className="btn-ghost p-1.5 rounded text-profit" onClick={addAccount}><Check size={14} /></button>
            <button className="btn-ghost p-1.5 rounded" onClick={() => setAddingAccount(false)}><X size={14} /></button>
          </div>
        )}
      </div>

      {/* Commission & Tick Values */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Commission & Tick Values</h2>
          <p className="text-xs text-slate-500 mt-0.5">Used for automatic P&L calculation</p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-400 border-b border-border pb-2">NQ (E-mini NASDAQ)</h3>
            <div>
              <label className="label">Commission per contract (round trip) $</label>
              <input type="number" step="0.01" className="input font-mono" value={settings.commission_nq}
                onChange={e => setSettings(s => ({ ...s, commission_nq: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tick value $</label>
              <input type="number" step="0.01" className="input font-mono" value={settings.tick_value_nq}
                onChange={e => setSettings(s => ({ ...s, tick_value_nq: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">NQ: $5/tick = $20/point (4 ticks/point)</p>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-400 border-b border-border pb-2">MNQ (Micro E-mini NASDAQ)</h3>
            <div>
              <label className="label">Commission per contract (round trip) $</label>
              <input type="number" step="0.01" className="input font-mono" value={settings.commission_mnq}
                onChange={e => setSettings(s => ({ ...s, commission_mnq: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tick value $</label>
              <input type="number" step="0.01" className="input font-mono" value={settings.tick_value_mnq}
                onChange={e => setSettings(s => ({ ...s, tick_value_mnq: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">MNQ: $0.50/tick = $2/point (4 ticks/point)</p>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Default CSV Import Format</label>
          <select className="select w-48" value={settings.csv_format}
            onChange={e => setSettings(s => ({ ...s, csv_format: e.target.value }))}>
            <option value="manual">Manual / Generic</option>
            <option value="tradovate">Tradovate</option>
            <option value="rithmic">Rithmic</option>
          </select>
        </div>

      </div>

      {/* Market Data */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Market Data</h2>
          <p className="text-xs text-slate-500 mt-0.5">API keys for live market prices and economic calendar</p>
        </div>

        <div className="space-y-2">
          <label className="label flex items-center gap-2">
            Finnhub API Key
            <a href="https://finnhub.io/register" target="_blank" rel="noreferrer"
              className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 text-[11px]">
              Get free key <ExternalLink size={10} />
            </a>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              className="input font-mono pr-10"
              placeholder="e.g. cq3abc123def456..."
              value={settings.finnhub_api_key}
              onChange={e => setSettings(s => ({ ...s, finnhub_api_key: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Used for the economic calendar on the Market page. Price quotes (NQ, ES, GC, BTC) work without a key.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button className="btn-primary" onClick={saveSettings}>
            <Save size={15} /> Save Settings
          </button>
          {settingsSaved && <span className="text-profit text-sm">Settings saved!</span>}
        </div>
      </div>

      {/* Tag sections */}
      {TAG_TYPES.map(t => (
        <TagSection key={t.key} type={t.key} label={t.label} desc={t.desc} />
      ))}
    </div>
  );
}
