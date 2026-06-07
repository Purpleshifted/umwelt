import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Umwelt — Somatic Acoustic Sculpture",
  description: "An immersive installation that translates biosensor signals into acoustic sculpture and reactive point lighting within an infinite mirror phone booth.",
};

import NavBar from "@/components/layout/NavBar";
import GlobalDashboard from "@/components/GlobalDashboard";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <NavBar />
        {children}
        <GlobalDashboard />
      </body>
    </html>
  );
}
