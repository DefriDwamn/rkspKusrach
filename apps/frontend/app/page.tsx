import { ChatWidget } from "../src/components/ChatWidget.js";

export default function HomePage() {
  return (
    <main>
      <h1>RAG Support Chatbot</h1>
      <p>Вопросы обрабатываются с опорой на внутреннюю базу знаний и цитаты.</p>
      <ChatWidget />
    </main>
  );
}
