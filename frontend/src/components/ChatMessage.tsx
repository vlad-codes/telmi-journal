import { useEffect, useRef, useState } from 'react';
import type { ChatMessage as ChatMessageType } from '../types';
import telmiAvatar from '../assets/telmi-avatar.svg';

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  thinkingMode?: boolean;
}

export default function ChatMessageBubble({ message, isStreaming, thinkingMode }: Props) {
  const isUser = message.role === 'user';

  // The model is actively reasoning: still streaming, no answer yet, and either
  // this request used thinking mode or we've already received thinking tokens.
  const thinkingActive =
    !isUser && !!isStreaming && !message.content && (!!thinkingMode || !!message.thinking);
  const showThinking = !isUser && (!!message.thinking || thinkingActive);

  return (
    <div className={`msg-enter flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <img
          src={telmiAvatar}
          alt="Telmi"
          className="w-7 h-7 rounded-full shrink-0 mr-2.5 mt-0.5 object-cover
                     shadow-sm shadow-indigo-500/25"
        />
      )}
      <div
        className={`max-w-[76%] text-[14px] leading-relaxed
          ${isUser
            ? `rounded-2xl rounded-br-md px-4 py-3
               bg-gradient-to-br from-indigo-500 to-indigo-700
               dark:from-indigo-500 dark:to-indigo-600
               text-white shadow-md shadow-indigo-500/20`
            : `rounded-2xl rounded-bl-md px-4 py-3
               bg-white/85 dark:bg-slate-800/70
               border border-slate-200/70 dark:border-white/[0.09]
               text-slate-800 dark:text-slate-100
               shadow-sm shadow-black/5 dark:shadow-black/20
               backdrop-blur-sm`
          }`}
      >
        {showThinking && (
          <ThinkingBlock text={message.thinking ?? ''} active={thinkingActive} />
        )}
        {message.content && (
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
        )}
        {isStreaming && message.content && (
          <span className="cursor-blink inline-block w-[2px] h-[14px] bg-current ml-1 align-middle rounded-full" />
        )}
      </div>
    </div>
  );
}

function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the thinking view pinned to the latest tokens while it streams.
  useEffect(() => {
    if (open && active && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, open, active]);

  const hasContent = text.trim().length > 0;

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12px] font-medium
                   text-slate-400 dark:text-slate-500
                   hover:text-slate-600 dark:hover:text-slate-300
                   transition-colors duration-150"
      >
        <span
          className={`inline-block text-[9px] transition-transform duration-150
                      ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <span>💭</span>
        {active ? (
          <span className="thinking-shimmer">Thinking…</span>
        ) : (
          <span>Thoughts</span>
        )}
      </button>

      {open && (
        <div
          ref={bodyRef}
          className="mt-1.5 mb-1 ml-1 pl-3 max-h-52 overflow-y-auto
                     border-l-2 border-slate-200 dark:border-white/[0.12]
                     text-[12px] leading-relaxed
                     text-slate-500 dark:text-slate-400
                     whitespace-pre-wrap"
        >
          {hasContent ? text : active ? 'Warming up…' : ''}
        </div>
      )}
    </div>
  );
}
