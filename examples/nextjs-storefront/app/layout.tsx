import type { ReactNode } from 'react';

export const metadata = { title: 'Page Builder example storefront' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#111' }}>{children}</body>
    </html>
  );
}
