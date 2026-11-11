"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { keyFingerprint } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { listDevices, revokeDevice } from "@/services/device.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import type { DeviceRecord } from "@/types/auth";
import { clearDeviceIdentity } from "@/lib/device-keystore";
import { realtime } from "@/services/socket.service";

export function DeviceManagement() {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const currentId = useChatStore((state) => state.device?.deviceId ?? null);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError(null);
    try {
      const result = await listDevices();
      const next: Record<string, string> = {};
      for (const device of result.devices) {
        next[device.id] = await keyFingerprint(device.identityPublicKey);
      }
      setDevices(result.devices);
      setFingerprints(next);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listDevices();
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const device of result.devices) {
          next[device.id] = await keyFingerprint(device.identityPublicKey);
        }
        if (cancelled) return;
        setDevices(result.devices);
        setFingerprints(next);
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(deviceId: string) {
    if (!csrfToken) return;
    if (!window.confirm("Revoke this device? It will be signed out of realtime messaging.")) return;
    setError(null);
    try {
      await revokeDevice(csrfToken, deviceId);
      if (deviceId === currentId) {
        await clearDeviceIdentity();
        realtime.disconnect();
        useChatStore.getState().setDevice(null, "This device was revoked.");
      }
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading devices</p>;

  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {devices.length === 0 ? <p className="text-sm text-[var(--muted)]">No devices registered.</p> : null}
      <ul className="grid gap-2">
        {devices.map((device) => (
          <li key={device.id} className="rounded-2xl border border-[var(--border)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {device.deviceName}
                  {device.id === currentId ? " · this browser" : ""}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {device.deviceStatus} · registration {device.registrationId}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">Public key fingerprint {fingerprints[device.id] ?? "…"}</p>
                <p className="text-xs text-[var(--muted)]">This fingerprint is not a Signal safety number.</p>
              </div>
              {device.deviceStatus === "active" ? (
                <Button variant="danger" onClick={() => void revoke(device.id)}>
                  Revoke
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
