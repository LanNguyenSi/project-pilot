import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "project-pilot",
  description: "Unified control plane for project lifecycle",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
