import { ChatWidget } from "../src/components/ChatWidget.js";

export default function HomePage() {
  return (
    <main className="app-page">
      <header className="app-header">
        <h1>RAG Support Chatbot</h1>
        <p>Вопросы обрабатываются с опорой на внутреннюю базу знаний и цитаты.</p>
      </header>
      <ChatWidget />
    </main>
  );
}
