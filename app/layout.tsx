import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forbes · Email Studio",
  description: "Внутрішній редактор email-розсилок Forbes Україна.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className="antialiased">{children}</body>
    </html>
  );
}
