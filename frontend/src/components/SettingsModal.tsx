import { useEffect, useRef, useState } from 'react';

const API = 'http://localhost:8000';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [prompt, setPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialPromptRef = useRef('');
  const dirty = prompt.trim() !== initialPromptRef.current.trim();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/character-prompt`);
        if (res.ok) {
          const data = await res.json();
          setPrompt(data.prompt ?? '');
          setDefaultPrompt(data.default ?? '');
          initialPromptRef.current = data.prompt ?? '';
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    const text = prompt.trim();
    if (!text) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API}/character-prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.prompt ?? text);
        initialPromptRef.current = data.prompt ?? text;
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        alert('Save failed. Please try again.');
      }
    } catch {
      alert('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!confirm('Reset the journal character to the default prompt?')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/character-prompt`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.prompt ?? defaultPrompt);
        initialPromptRef.current = data.prompt ?? defaultPrompt;
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const isDefault = prompt.trim() === defaultPrompt.trim();

  function handleClose() {
    if (dirty && !confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  }

  return (
    <div
      onClick={handleClose}
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
              Journal character
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              How Telmi talks to you. The internal rules (memory & saving) are fixed and stay out of sight.
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="w-7 h-7 rounded-lg flex items-center justify-center
                       text-slate-400 hover:text-slate-700
                       dark:hover:text-slate-200
                       hover:bg-slate-100 dark:hover:bg-white/[0.08]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest
                         text-slate-400 mb-2">
            Character prompt
          </h3>
          {loading ? (
            <p className="text-[12px] text-slate-400">Loading…</p>
          ) : (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={10}
              className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed
                         bg-white dark:bg-slate-800
                         border border-slate-300 dark:border-white/10
                         text-slate-700 dark:text-slate-200
                         focus:outline-none focus:ring-2
                         focus:ring-indigo-400/40 resize-y"
              maxLength={2000}
            />
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            Tip: keep it short and concrete — smaller local models follow brief instructions best.
          </p>
        </div>

        <div className="px-5 py-3 flex items-center justify-between
                        border-t border-slate-200 dark:border-white/10">
          <button
            onClick={resetToDefault}
            disabled={loading || saving || isDefault}
            className="text-[11px] text-slate-500 hover:text-slate-800
                       dark:hover:text-slate-200
                       disabled:text-slate-300 dark:disabled:text-slate-600
                       disabled:cursor-not-allowed disabled:no-underline hover:underline"
          >
            Reset to default
          </button>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-[11px] text-emerald-500">Saved</span>
            )}
            <button
              onClick={save}
              disabled={loading || saving || !prompt.trim()}
              className="text-[13px] rounded-xl px-3 py-1.5
                         text-white bg-indigo-600 hover:bg-indigo-500
                         dark:bg-indigo-500 dark:hover:bg-indigo-400
                         transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
