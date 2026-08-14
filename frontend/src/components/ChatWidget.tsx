import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "How many violations this week?",
  "Open incidents",
  "Total fines collected",
  "Top zone by violations",
];

let messageIdCounter = 0;

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: messageIdCounter++,
      role: "assistant",
      text: "Hi, I'm the VeloSafe assistant. Ask me about violations, incidents, zones, or fines — I'll answer from live data.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    const userMsg: ChatMessage = { id: messageIdCounter++, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    try {
      const result = await api.post<{ reply: string }>("/chat", { message: text });
      setMessages((prev) => [...prev, { id: messageIdCounter++, role: "assistant", text: result.reply }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Sorry, something went wrong reaching the assistant.";
      setMessages((prev) => [...prev, { id: messageIdCounter++, role: "assistant", text: message }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <div>
              <div className="chat-panel-title">VeloSafe Assistant</div>
              <div className="chat-panel-subtitle">Ask about live traffic data</div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>

          <div className="chat-messages" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role}`}>
                {m.text}
              </div>
            ))}
            {sending && <div className="chat-bubble assistant chat-typing">Thinking…</div>}
          </div>

          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => sendMessage(s)} disabled={sending}>
                {s}
              </button>
            ))}
          </div>

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label="Toggle assistant chat">
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
