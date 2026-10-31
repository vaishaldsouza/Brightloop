import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brightloop Subscriptions",
  description: "B2B Subscription Management & Invoicing System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-surface">
      <body className="min-h-full flex flex-col font-sans text-on-surface bg-surface antialiased">
        {children}
      </body>
    </html>
  );
}
