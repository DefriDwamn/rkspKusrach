import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "RAG Support Chatbot",
  description: "Client app for internal knowledge base support chatbot",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
