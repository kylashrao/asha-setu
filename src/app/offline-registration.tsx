"use client";

import { useEffect } from "react";

export function OfflineRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Offline setup failed", error);
      });
    }
  }, []);
  return null;
}
