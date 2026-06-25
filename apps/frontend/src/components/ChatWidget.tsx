"use client";

import React, { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@rksp/shared";
import { clearChatHistory, fetchChatHistory, sendChatMessage } from "../lib/api.js";

const SESSION_STORAGE_KEY = "rksp-chat-session-id";

function resolveSessionId(): string {
  if (typeof window === "undefined") {
    return "server-session";
  }

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = window.crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

export function ChatWidget() {
  const [sessionId, setSessionId] = useState<string>("server-session");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastCitations, setLastCitations] = useState<
    { sourceId: string; title: string; snippet: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextSessionId = resolveSessionId();
    setSessionId(nextSessionId);

    void fetchChatHistory(nextSessionId)
      .then((history) => setMessages(history.messages))
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unknown error");
      });
  }, []);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages, loading]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: prompt.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setPrompt("");
    setLoading(true);
    setError(null);

    try {
      const response = await sendChatMessage({
        sessionId,
        message: userMessage.content,
        history: nextMessages,
      });

      setMessages((prev) => [...prev, { role: "assistant", content: response.answer }]);
      setLastCitations(response.citations);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const onClearHistory = async (): Promise<void> => {
    setClearing(true);
    setError(null);

    try {
      await clearChatHistory(sessionId);
      setMessages([]);
      setLastCitations([]);
      setPrompt("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="chat-shell">
      <header className="chat-header">
        <div>
          <h2>RAG чат</h2>
          <span>{messages.length} сообщений</span>
        </div>
        <button
          className="secondary-button"
          disabled={clearing || loading || messages.length === 0}
          onClick={onClearHistory}
          type="button"
        >
          {clearing ? "Очистка..." : "Очистить"}
        </button>
      </header>

      <div className="messages" aria-live="polite">
        {messages.length === 0 && <p>Задайте вопрос базе знаний.</p>}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
            <strong>{message.role === "user" ? "Вы" : "Ассистент"}:</strong> {message.content}
          </article>
        ))}
        {loading && <article className="message assistant">Ассистент печатает...</article>}
        <div ref={messagesEndRef} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Например: как сбросить пароль?"
          aria-label="Вопрос"
        />
        <button disabled={loading} type="submit">
          {loading ? "Отправка..." : "Отправить"}
        </button>
      </form>

      {error && <p role="alert">Ошибка: {error}</p>}

      {lastCitations.length > 0 && (
        <div className="citations">
          <strong>Источники:</strong>
          <ul>
            {lastCitations.map((citation) => (
              <li key={citation.sourceId}>
                {citation.title}: {citation.snippet}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
