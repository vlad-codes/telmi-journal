import { useEffect, useState } from 'react';
import type { Note } from '../types';

const API = 'http://localhost:8000';

interface MemoryPanelProps {
  refreshKey: number;
  onClose: () => void;
}

export default function MemoryPanel({ refreshKey, onClose }: MemoryPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [notesRes, briefRes] = await Promise.all([
        fetch(`${API}/notes`),
        fetch(`${API}/recent-brief`),
      ]);
      if (notesRes.ok) setNotes(await notesRes.json());
      if (briefRes.ok) setBrief(await briefRes.text());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function deleteNote(id: string) {
    await fetch(`${API}/notes/${id}`, { method: 'DELETE' });
    setNotes((ns) => ns.filter((n) => n.id !== id));
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    const res = await fetch(`${API}/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const updated: Note = await res.json();
      setNotes((ns) => ns.map((n) => (n.id === id ? updated : n)));
    }
    setEditingId(null);
  }

  async function clearAll() {
    if (!confirm('Delete all notes and the recent brief?')) return;
    await Promise.all([
      fetch(`${API}/notes`, { method: 'DELETE' }),
      fetch(`${API}/recent-brief`, { method: 'DELETE' }),
    ]);
    setNotes([]);
    setBrief('');
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-center justify-center
                    bg-black/30 dark:bg-black/50 backdrop-blur-sm">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[80vh] flex flex-col
                      bg-white dark:bg-slate-900
                      border border-slate-200 dark:border-white/10
                      rounded-2xl shadow-xl">
        <div className="px-5 py-4 flex items-center justify-between
                        border-b border-slate-200 dark:border-white/10">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">
              What Telmi remembers
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Visible only to you. Editable, deletable, local.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-lg flex items-center justify-center
                       text-slate-400 hover:text-slate-700
                       dark:hover:text-slate-200
                       hover:bg-slate-100 dark:hover:bg-white/[0.08]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest
                           text-slate-400 mb-2">
              Recent context
            </h3>
            {loading ? (
              <p className="text-[12px] text-slate-400">Loading…</p>
            ) : brief ? (
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                {brief}
              </p>
            ) : (
              <p className="text-[12px] text-slate-400 italic">
                No recent brief yet — it appears after your next saved session.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest
                           text-slate-400 mb-2">
              Notes ({notes.length})
            </h3>
            {loading ? (
              <p className="text-[12px] text-slate-400">Loading…</p>
            ) : notes.length === 0 ? (
              <p className="text-[12px] text-slate-400 italic">
                Nothing yet. Telmi will jot down facts you share, after each session.
              </p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="group flex items-start gap-2 text-[13px]
                               text-slate-700 dark:text-slate-200"
                  >
                    {editingId === n.id ? (
                      <>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          className="flex-1 rounded-lg px-2 py-1 text-[13px]
                                     bg-white dark:bg-slate-800
                                     border border-slate-300 dark:border-white/10
                                     focus:outline-none focus:ring-2
                                     focus:ring-indigo-400/40 resize-none"
                        />
                        <button
                          onClick={() => saveEdit(n.id)}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400
                                     hover:underline shrink-0 mt-1"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-[11px] text-slate-400 hover:underline shrink-0 mt-1"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 leading-relaxed">{n.text}</span>
                        <button
                          onClick={() => { setEditingId(n.id); setEditText(n.text); }}
                          className="opacity-0 group-hover:opacity-100 transition
                                     text-[11px] text-slate-400 hover:text-slate-700
                                     dark:hover:text-slate-200 shrink-0"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => deleteNote(n.id)}
                          aria-label="Delete note"
                          className="opacity-0 group-hover:opacity-100 transition
                                     text-slate-400 hover:text-red-500 shrink-0"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="px-5 py-3 flex items-center justify-between
                        border-t border-slate-200 dark:border-white/10">
          <button
            onClick={clearAll}
            disabled={notes.length === 0 && !brief}
            className="text-[11px] text-red-500 hover:underline
                       disabled:text-slate-300 dark:disabled:text-slate-600
                       disabled:cursor-not-allowed disabled:no-underline"
          >
            Clear everything
          </button>
          <button
            onClick={load}
            className="text-[11px] text-slate-500 hover:text-slate-800
                       dark:hover:text-slate-200"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
