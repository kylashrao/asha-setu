import type { Metadata, Viewport } from "next";
import { OfflineRegistration } from "./offline-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASHA-Setu | Maternal care",
  description: "Offline maternal triage and visit records for ASHA workers.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#103b33" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <OfflineRegistration />
      </body>
    </html>
  );
}
