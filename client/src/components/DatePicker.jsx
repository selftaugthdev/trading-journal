import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import {
  format, parseISO, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay,
} from 'date-fns';
import { cn } from '../lib/utils.js';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DatePicker({ value, onChange, placeholder = 'Pick date', className = '' }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? parseISO(value) : new Date());
  const containerRef = useRef();

  useEffect(() => {
    if (value) setViewDate(parseISO(value));
  }, [value]);

  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const monthStart = startOfMonth(viewDate);
  const calDays = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(viewDate)),
  });

  const selected = value ? parseISO(value) : null;

  function pick(day) {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  }

  function clear(e) {
    e.stopPropagation();
    onChange('');
  }

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'input flex items-center gap-1.5 cursor-pointer py-1.5 text-xs w-36 text-left',
          open && 'border-violet-500 ring-1 ring-violet-500/30',
          !value && 'text-slate-500',
        )}
      >
        <Calendar size={11} className="shrink-0 text-slate-500" />
        <span className="flex-1 truncate">
          {value ? format(parseISO(value), 'd MMM yyyy') : placeholder}
        </span>
        {value && (
          <span
            onClick={clear}
            className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors leading-none"
          >
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-60 bg-surface-2 border border-border rounded-xl shadow-2xl shadow-black/60 p-3">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="btn-ghost p-1 rounded-lg"
              onClick={() => setViewDate(d => subMonths(d, 1))}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-slate-200 select-none">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              className="btn-ghost p-1 rounded-lg"
              onClick={() => setViewDate(d => addMonths(d, 1))}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-slate-500 py-0.5 select-none">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {calDays.map(day => {
              const inMonth = isSameMonth(day, viewDate);
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    'h-7 w-full rounded-lg text-xs font-medium transition-all select-none',
                    !inMonth && 'opacity-25',
                    isSelected && 'bg-violet-600 text-white shadow-lg shadow-violet-900/50',
                    !isSelected && isToday && 'border border-violet-500/50 text-violet-400',
                    !isSelected && !isToday && inMonth && 'hover:bg-surface-4 text-slate-300',
                    !isSelected && !isToday && !inMonth && 'text-slate-600',
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Footer: Today shortcut */}
          <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
            <button
              type="button"
              className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
              onClick={() => pick(new Date())}
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                className="text-[11px] text-slate-500 hover:text-slate-400 transition-colors"
                onClick={() => { onChange(''); setOpen(false); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
