import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gtech Chatbot - NICK',
  description: 'Chat with NICK, your Gtech product assistant',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

