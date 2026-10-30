import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Betterverse Duo - Private Avatar Space',
  description: 'A private web room where two people mirror in 3D avatars with spatial audio',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-blue text-yellow min-h-screen font-bold">
        {children}
      </body>
    </html>
  );
}
