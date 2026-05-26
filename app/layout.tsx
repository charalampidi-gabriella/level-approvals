import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rippner Level Approvals",
  description: "Track level evaluations and approvals across coaches.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
