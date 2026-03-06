import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lawer - AI-ассистент юридического отдела",
  description: "Интеллектуальный помощник для юристов. Анализ документов, генерация договоров, правовая аналитика.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
