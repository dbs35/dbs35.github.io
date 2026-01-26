import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Community Journalist",
  description: "Talk with your AI community journalist",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
