"use client";

import React, { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@rksp/shared";
import {
  clearChatHistory,
  fetchAuthStatus,
  fetchChatHistory,
  login,
  logout,
  register,
  sendChatMessage,
  updateChatMessage,
} from "../lib/api.js";

const SESSION_STORAGE_KEY = "rksp-chat-session-id";

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

  for (const match of text.matchAll(pattern)) {
    const marker = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    if (marker.startsWith("`")) {
      nodes.push(<code key={`code-${key += 1}`}>{marker.slice(1, -1)}</code>);
    } else if (marker.startsWith("**")) {
      nodes.push(<strong key={`strong-${key += 1}`}>{marker.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`em-${key += 1}`}>{marker.slice(1, -1)}</em>);
    }

    cursor = index + marker.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const listItems: string[] = [];
    while (index < lines.length) {
      const item = lines[index]?.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
      if (!item) {
        break;
      }

      listItems.push(item[1] ?? "");
      index += 1;
    }

    if (listItems.length > 0) {
      blocks.push(
        <ul key={`list-${key += 1}`}>
          {listItems.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index]?.trimEnd() ?? "";
      if (paragraphLine.trim().length === 0 || /^\s*(?:[-*]|\d+\.)\s+/.test(paragraphLine)) {
        break;
      }

      paragraphLines.push(paragraphLine.trim());
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${key += 1}`}>{renderInlineMarkdown(paragraphLines.join(" "))}</p>,
    );
  }

  return <div className="message-content markdown-content">{blocks}</div>;
}

function resolveSessionId(scope: string): string {
  if (typeof window === "undefined") {
    return "server-session";
  }

  const storageKey = `${SESSION_STORAGE_KEY}:${scope}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const next = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, next);
  return next;
}

export function ChatWidget() {
  const [authState, setAuthState] = useState<"loading" | "guest" | "authenticated">("loading");
  const [authenticatedUsername, setAuthenticatedUsername] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [guestChatUsed, setGuestChatUsed] = useState(false);
  const [sessionId, setSessionId] = useState<string>("server-session");
  const [prompt, setPrompt] = useState("");
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastCitations, setLastCitations] = useState<
    { sourceId: string; title: string; snippet: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchAuthStatus()
      .then((status) => {
        const scope = status.authenticated && status.username ? `user:${status.username.toLowerCase()}` : "guest";
        const nextSessionId = resolveSessionId(scope);
        setSessionId(nextSessionId);
        setAuthState(status.authenticated ? "authenticated" : "guest");
        setAuthenticatedUsername(status.username ?? null);
        setGuestChatUsed(!status.guestChatAvailable);
        if (status.authenticated) {
          return fetchChatHistory(nextSessionId).then((history) => setMessages(history.messages));
        }
        return undefined;
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unknown error");
        setSessionId(resolveSessionId("guest"));
        setAuthState("guest");
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

    if (authState === "guest" && guestChatUsed) {
      setError("Для анонимного режима доступен только один запрос. Войдите, чтобы продолжить.");
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
      if (authState === "guest") {
        setGuestChatUsed(true);
      }
    } catch (requestError) {
      setMessages(messages);
      if (requestError instanceof Error && requestError.message.includes("429")) {
        setGuestChatUsed(true);
      }
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
      setEditingMessageIndex(null);
      setEditingMessageContent("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
    } finally {
      setClearing(false);
    }
  };

  const authenticate = async (action: typeof login | typeof register): Promise<void> => {
    setAuthSubmitting(true);
    try {
      const status = await action(username, password);
      if (!status.username) {
        throw new Error("Authentication response does not contain a username");
      }
      const nextSessionId = resolveSessionId(`user:${status.username.toLowerCase()}`);
      setSessionId(nextSessionId);
      setAuthState("authenticated");
      setAuthenticatedUsername(status.username);
      setUsername("");
      setPassword("");
      setError(null);
      const history = await fetchChatHistory(nextSessionId);
      setMessages(history.messages);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const onLogin = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void authenticate(login);
  };

  const onLogout = async (): Promise<void> => {
    await logout();
    const status = await fetchAuthStatus();
    const guestSessionId = resolveSessionId("guest");
    setSessionId(guestSessionId);
    setAuthState("guest");
    setAuthenticatedUsername(null);
    setGuestChatUsed(!status.guestChatAvailable);
    setMessages([]);
    setLastCitations([]);
    setEditingMessageIndex(null);
    setEditingMessageContent("");
  };

  const onStartEditMessage = (index: number, currentContent: string): void => {
    setEditingMessageIndex(index);
    setEditingMessageContent(currentContent);
    setError(null);
  };

  const onCancelEditMessage = (): void => {
    setEditingMessageIndex(null);
    setEditingMessageContent("");
  };

  const onSaveEditMessage = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (editingMessageIndex === null) {
      return;
    }

    const nextContent = editingMessageContent.trim();
    if (!nextContent) {
      setError("Сообщение не может быть пустым.");
      return;
    }

    try {
      const updatedHistory = await updateChatMessage(sessionId, editingMessageIndex, nextContent);
      setMessages(updatedHistory.messages);
      onCancelEditMessage();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
    }
  };

  const onPromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <section className="chat-shell">
      <header className="chat-header">
        <div>
          <h2>RAG чат</h2>
          <span>
            {authState === "authenticated"
              ? `${authenticatedUsername ?? "Пользователь"}: ${messages.length} сообщений`
              : guestChatUsed ? "Гостевой запрос использован" : "Гостевой режим: доступен один запрос"}
          </span>
        </div>
        <div className="chat-header-actions">
          {authState === "authenticated" ? (
            <button className="secondary-button" disabled={clearing || loading || messages.length === 0} onClick={onClearHistory} type="button">
              {clearing ? "Очистка..." : "Очистить"}
            </button>
          ) : null}
          {authState === "authenticated" ? (
            <button className="secondary-button" onClick={onLogout} type="button">Выйти</button>
          ) : null}
        </div>
      </header>

      {authState !== "authenticated" && (
        <form className="auth-panel" onSubmit={onLogin}>
          <input
            autoComplete="username"
            aria-label="Логин"
            placeholder="Логин"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            autoComplete="current-password"
            aria-label="Пароль"
            placeholder="Пароль"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="auth-actions">
            <button disabled={authSubmitting || username.length === 0 || password.length === 0} type="submit">
              {authSubmitting ? "Подождите..." : "Войти"}
            </button>
            <button
              className="secondary-button"
              disabled={authSubmitting || username.length === 0 || password.length < 8}
              onClick={() => void authenticate(register)}
              type="button"
            >
              Регистрация
            </button>
          </div>
        </form>
      )}

      <div className="messages" aria-live="polite">
        {messages.length === 0 && <p>Задайте вопрос базе знаний.</p>}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
            <div className="message-header">
              <strong className="message-label">{message.role === "user" ? "Вы" : "Ассистент"}:</strong>
              {message.role === "user" && authState === "authenticated" && (
                <button
                  className="secondary-button message-edit-button"
                  aria-label="Редактировать сообщение"
                  onClick={() => onStartEditMessage(index, message.content)}
                  type="button"
                >
                  Ред.
                </button>
              )}
            </div>
            {message.role === "assistant" ? (
              <MarkdownMessage content={message.content} />
            ) : (
              <span className="message-content plain-content">{message.content}</span>
            )}
            {message.role === "user" && authState === "authenticated" && editingMessageIndex === index && (
              <form className="edit-panel" onSubmit={(event) => void onSaveEditMessage(event)}>
                <textarea
                  aria-label="Текст сообщения"
                  value={editingMessageContent}
                  onChange={(event) => setEditingMessageContent(event.target.value)}
                />
                <div className="edit-panel-actions">
                  <button type="submit">Сохранить</button>
                  <button className="secondary-button" onClick={onCancelEditMessage} type="button">
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </article>
        ))}
        {loading && <article className="message assistant">Ассистент печатает...</article>}
        <div ref={messagesEndRef} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          disabled={authState === "loading" || (authState === "guest" && guestChatUsed)}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={onPromptKeyDown}
          placeholder="Например: как сбросить пароль?"
          aria-label="Вопрос"
        />
        <button disabled={loading || authState === "loading" || (authState === "guest" && guestChatUsed)} type="submit">
          {loading ? "Отправка..." : authState === "guest" && guestChatUsed ? "Недоступно" : "Отправить"}
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
