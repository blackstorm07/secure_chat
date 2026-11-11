"use client";

import { ChatPinSettings } from "@/components/settings/ChatPinSettings";
import { DeviceManagement } from "@/components/settings/DeviceManagement";

export function SecuritySettings() {
  return (
    <div className="grid gap-4">
      <ChatPinSettings />
      <div>
        <h3 className="mb-2 text-sm font-semibold">Linked devices</h3>
        <DeviceManagement />
      </div>
    </div>
  );
}
