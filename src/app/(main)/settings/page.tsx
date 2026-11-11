import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <SettingsPanel />
    </ErrorBoundary>
  );
}
