import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mesh Collaborative Canvas',
  description: 'Production-grade real-time distributed collaborative canvas engine'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
