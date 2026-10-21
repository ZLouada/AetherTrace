import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AetherTrace Flight Deck | Wireshark for AI Agents',
  description: 'Local-first visual debugger, reverse proxy, and time-travel replay engine for multi-agent workflows.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-canvas text-gray-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
