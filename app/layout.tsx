import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google';
import './globals.css';
import Shell from '@/components/Shell';

// Fonts are downloaded at build time and served with the app (no runtime CDN).
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex' });
const cond = IBM_Plex_Sans_Condensed({ subsets: ['latin'], weight: ['600'], variable: '--font-plex-cond' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'Tallyward · Continuous Control Testing (Snowflake example)',
  description: 'Test entire populations instead of samples, triage exceptions with AI, and keep evidence for every run. Synthetic data.',
};

// Applies the saved theme (or the OS preference) before first paint.
const THEME = `try{var t=localStorage.getItem('tw-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${cond.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
