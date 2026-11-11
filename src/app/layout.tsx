import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionEvents } from "@/components/layout/SessionEvents";
import { ThemeHydrator } from "@/components/layout/ThemeHydrator";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SecureChat", template: "%s · SecureChat" },
  description: "Private messaging client for an authenticated ciphertext relay.",
};

const themeBoot = `try{var t=localStorage.getItem("securechat-theme");document.documentElement.classList.add(t==="light"?"light":"dark")}catch(e){document.documentElement.classList.add("dark")}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <ThemeHydrator />
        <SessionEvents />
        {children}
      </body>
    </html>
  );
}
