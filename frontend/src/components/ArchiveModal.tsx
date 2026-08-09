import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Entry } from '../types';

const API = 'http://localhost:8000';
const USE_VECTOR_SEARCH_THRESHOLD = 15;

interface Props {
  onClose: () => void;
  initialChatTimestamp?: string;
  onDataChange?: () => void;
}

export default function ArchiveModal({ onClose, initialChatTimestamp, onDataChange }: Props) {
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [displayedEntries, setDisplayedEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [openTimestamp, setOpenTimestamp] = useState<string | null>(null);
  const [editingTimestamp, setEditingTimestamp] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [chatTimestamp, setChatTimestamp] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadEntries();
  }, []);

  // Auto-open chat history when arriving from calendar day click
  useEffect(() => {
    if (initialChatTimestamp && !loading) {
      openChat(initialChatTimestamp);
    }
  }, [loading, initialChatTimestamp]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      // This effect reconciles server-backed search results with the full list.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedEntries(allEntries);
      return;
    }

    if (allEntries.length >= USE_VECTOR_SEARCH_THRESHOLD) {
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const res = await fetch(`${API}/search?q=${encodeURIComponent(query)}&limit=50`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const results: Entry[] = await res.json();
          setDisplayedEntries(results);
        } catch {
          const q = query.toLowerCase();
          setDisplayedEntries(
            allEntries.filter(
              (e) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)
            )
          );
        } finally {
          setIsSearching(false);
        }
      }, 300);
    } else {
      const q = query.toLowerCase();
      setDisplayedEntries(
        allEntries.filter(
          (e) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)
        )
      );
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, allEntries]);

  async function loadEntries() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/entries`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Entry[] = await res.json();
      const reversed = [...data].reverse();
      setAllEntries(reversed);
      setDisplayedEntries(reversed);
    } catch {
      setError('Failed to load entries.');
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen(ts: string) {
    if (editingTimestamp === ts) return;
    setChatTimestamp(null);
    setChatMessages([]);
    setOpenTimestamp((prev) => (prev === ts ? null : ts));
  }

  async function openChat(ts: string) {
    setChatTimestamp(ts);
    setChatMessages([]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/entries/${encodeURIComponent(ts)}/chat`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ChatMessage[] = await res.json();
      setChatMessages(data);
    } catch {
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  }

  function startEdit(entry: Entry) {
    setEditDraft(entry.summary);
    setEditingTimestamp(entry.timestamp);
    setOpenTimestamp(entry.timestamp);
  }

  function cancelEdit() {
    setEditingTimestamp(null);
    setEditDraft('');
  }

  async function saveEdit(entry: Entry) {
    setSaving(true);
    try {
      const res = await fetch(
        `${API}/entries/${encodeURIComponent(entry.timestamp)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: entry.title, summary: editDraft }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Entry = await res.json();
      setAllEntries((prev) => prev.map((e) => (e.timestamp === entry.timestamp ? updated : e)));
      setDisplayedEntries((prev) => prev.map((e) => (e.timestamp === entry.timestamp ? updated : e)));
      setEditingTimestamp(null);
      setEditDraft('');
      onDataChange?.();
    } catch {
      alert('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(ts: string) {
    setConfirmDelete(null);
    try {
      const res = await fetch(`${API}/entries/${encodeURIComponent(ts)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAllEntries((prev) => prev.filter((e) => e.timestamp !== ts));
      setDisplayedEntries((prev) => prev.filter((e) => e.timestamp !== ts));
      if (openTimestamp === ts) setOpenTimestamp(null);
      if (editingTimestamp === ts) setEditingTimestamp(null);
      if (chatTimestamp === ts) { setChatTimestamp(null); setChatMessages([]); }
      onDataChange?.();
    } catch {
      // show error inline — no alert() since it's blocked in Tauri/WKWebView
      setError('Delete failed. Please try again.');
    }
  }

  function formatDate(ts: string) {
    try {
      return new Date(ts).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return ts;
    }
  }

  // Full-screen chat history overlay
  if (chatTimestamp) {
    const messages = chatMessages;
    const entry = allEntries.find((e) => e.timestamp === chatTimestamp);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div
          className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-xl"
          onClick={() => { setChatTimestamp(null); setChatMessages([]); }}
        />
        <div className="fade-in relative z-10 w-full max-w-xl max-h-[82vh] flex flex-col
                        bg-white/88 dark:bg-slate-900/88 backdrop-blur-2xl
                        border border-slate-200/60 dark:border-white/[0.09]
                        rounded-3xl shadow-2xl overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-4
                          border-b border-slate-100/80 dark:border-white/[0.07]">
            <button
              onClick={() => { setChatTimestamp(null); setChatMessages([]); }}
              className="text-[13px] text-slate-400 dark:text-slate-500
                         hover:text-slate-700 dark:hover:text-slate-200 transition-colors
                         flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                {entry?.title ?? ''}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {entry ? formatDate(entry.timestamp) : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center
                         text-slate-400 dark:text-slate-500
                         hover:bg-slate-100 dark:hover:bg-white/[0.08]
                         hover:text-slate-700 dark:hover:text-slate-200
                         transition-all text-sm"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5">
            {chatLoading && (
              <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center py-10 animate-pulse">
                Loading chat…
              </p>
            )}
            {!chatLoading && messages.length === 0 && (
              <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center py-10">
                No messages.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap
                    ${msg.role === 'user'
                      ? 'rounded-br-md bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm shadow-indigo-500/20'
                      : 'rounded-bl-md bg-white/80 dark:bg-slate-800/70 border border-slate-200/60 dark:border-white/[0.09] text-slate-800 dark:text-slate-100'
                    }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fade-in relative z-10 w-full max-w-xl max-h-[82vh] flex flex-col
                      bg-white/88 dark:bg-slate-900/88 backdrop-blur-2xl
                      border border-slate-200/60 dark:border-white/[0.09]
                      rounded-3xl shadow-2xl overflow-hidden">

        {/* Header: prominent search */}
        <div className="px-5 py-4 border-b border-slate-100/80 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  className="w-4 h-4 text-indigo-400 dark:text-indigo-500"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search your journal…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full text-[14px] pl-9 pr-4 py-2.5
                           bg-slate-50/80 dark:bg-white/[0.06]
                           border border-slate-200/70 dark:border-white/[0.09]
                           text-slate-800 dark:text-slate-100
                           placeholder-slate-400 dark:placeholder-slate-500
                           rounded-xl focus:outline-none
                           focus:ring-2 focus:ring-indigo-400/40
                           focus:border-indigo-300/60 dark:focus:border-indigo-500/40
                           transition-all duration-200"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                         text-slate-400 dark:text-slate-500
                         hover:bg-slate-100 dark:hover:bg-white/[0.08]
                         hover:text-slate-700 dark:hover:text-slate-200
                         transition-all text-sm"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {query && allEntries.length >= USE_VECTOR_SEARCH_THRESHOLD && !isSearching && (
            <p className="text-[11px] text-indigo-400 dark:text-indigo-500 mt-2 ml-1">
              Semantic search active
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center py-12 animate-pulse">
              Loading entries…
            </p>
          )}
          {error && (
            <p className="text-[13px] text-red-500 dark:text-red-400 text-center py-12">{error}</p>
          )}
          {!loading && !error && displayedEntries.length === 0 && (
            <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center py-12">
              {query ? 'No results found.' : 'No entries saved yet.'}
            </p>
          )}
          {!loading && !error && displayedEntries.length > 0 && (
            <ul className="divide-y divide-slate-100/80 dark:divide-white/[0.05]">
              {displayedEntries.map((entry) => {
                const isOpen = openTimestamp === entry.timestamp;
                const isEditing = editingTimestamp === entry.timestamp;
                const hasChat = entry.has_chat;
                return (
                  <li key={entry.timestamp}>
                    <button
                      onClick={() => toggleOpen(entry.timestamp)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left
                                 hover:bg-indigo-50/40 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                          {formatDate(entry.timestamp)}
                        </span>
                        <span className="text-[13px] text-slate-800 dark:text-slate-100 font-medium truncate">
                          {entry.title || '(no title)'}
                        </span>
                        {hasChat && (
                          <span className="shrink-0 text-[11px] text-indigo-600 dark:text-indigo-400
                                           bg-indigo-50 dark:bg-indigo-400/10
                                           px-2 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-400/20">
                            Chat
                          </span>
                        )}
                      </div>
                      <span className={`text-slate-400 dark:text-slate-500 text-[10px] ml-3 shrink-0
                                       transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        ▾
                      </span>
                    </button>

                    {/* Expanded content */}
                    {isOpen && (
                      <div className="px-5 pb-4 fade-in">
                        {isEditing ? (
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={6}
                            className="w-full text-[13px] text-slate-700 dark:text-slate-200
                                       bg-slate-50/80 dark:bg-white/[0.06]
                                       border border-slate-200/70 dark:border-white/[0.09]
                                       rounded-xl px-3 py-2.5
                                       focus:outline-none focus:ring-2 focus:ring-indigo-400/40
                                       focus:border-indigo-300/60 dark:focus:border-indigo-500/40
                                       resize-y transition-all"
                          />
                        ) : (
                          <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {entry.summary}
                          </p>
                        )}

                        <div className="flex gap-1.5 mt-3 flex-wrap">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(entry)}
                                disabled={saving}
                                className="text-[12px] font-medium px-3 py-1.5 rounded-xl
                                           bg-indigo-600 hover:bg-indigo-500 text-white
                                           transition-colors disabled:opacity-50"
                              >
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={saving}
                                className="text-[12px] px-3 py-1.5 rounded-xl
                                           text-slate-600 dark:text-slate-300
                                           bg-slate-100/80 dark:bg-white/[0.07]
                                           hover:bg-slate-200/70 dark:hover:bg-white/[0.12]
                                           border border-slate-200/60 dark:border-white/[0.08]
                                           transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {hasChat && (
                                <button
                                  onClick={() => openChat(entry.timestamp)}
                                  className="text-[12px] px-3 py-1.5 rounded-xl
                                             text-indigo-700 dark:text-indigo-300
                                             bg-indigo-50 dark:bg-indigo-400/10
                                             hover:bg-indigo-100 dark:hover:bg-indigo-400/20
                                             border border-indigo-200/60 dark:border-indigo-400/20
                                             transition-colors"
                                >
                                  Full chat
                                </button>
                              )}
                              <button
                                onClick={() => startEdit(entry)}
                                className="text-[12px] px-3 py-1.5 rounded-xl
                                           text-slate-600 dark:text-slate-300
                                           bg-slate-100/80 dark:bg-white/[0.07]
                                           hover:bg-slate-200/70 dark:hover:bg-white/[0.12]
                                           border border-slate-200/60 dark:border-white/[0.08]
                                           transition-colors"
                              >
                                Edit
                              </button>
                              {confirmDelete === entry.timestamp ? (
                                <>
                                  <span className="text-[12px] text-slate-500 dark:text-slate-400 px-1 self-center">
                                    Delete?
                                  </span>
                                  <button
                                    onClick={() => deleteEntry(entry.timestamp)}
                                    className="text-[12px] px-3 py-1.5 rounded-xl
                                               text-white bg-red-500 hover:bg-red-600
                                               transition-colors"
                                  >
                                    Yes, delete
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-[12px] px-3 py-1.5 rounded-xl
                                               text-slate-600 dark:text-slate-300
                                               bg-slate-100/80 dark:bg-white/[0.07]
                                               hover:bg-slate-200/70 dark:hover:bg-white/[0.12]
                                               border border-slate-200/60 dark:border-white/[0.08]
                                               transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(entry.timestamp)}
                                  className="text-[12px] px-3 py-1.5 rounded-xl
                                             text-red-600 dark:text-red-400
                                             bg-red-50/80 dark:bg-red-900/20
                                             hover:bg-red-100 dark:hover:bg-red-900/40
                                             border border-red-200/60 dark:border-red-700/30
                                             transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="px-5 py-2.5 border-t border-slate-100/80 dark:border-white/[0.07]
                          text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <span className="tabular-nums">{displayedEntries.length}</span>
            <span>{displayedEntries.length === 1 ? 'entry' : 'entries'}</span>
            {query && allEntries.length !== displayedEntries.length && (
              <span className="text-slate-300 dark:text-slate-600">
                of {allEntries.length}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
