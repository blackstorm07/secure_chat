"use client";

import { useEffect } from "react";
import { clearDeviceIdentity } from "@/lib/device-keystore";
import { ensureLocalDevice } from "@/services/device.service";
import { clearSignalDevice } from "@/services/encryption.service";
import { errorMessage } from "@/services/api";
import { realtime } from "@/services/socket.service";
import { useAuthStore } from "@/store/auth.store";
import { useCallStore } from "@/store/call.store";
import { useChatStore } from "@/store/chat.store";

export function useSocket() {
  const status = useAuthStore((state) => state.status);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const setDevice = useChatStore((state) => state.setDevice);
  const applyRealtime = useChatStore((state) => state.applyRealtime);

  useEffect(() => {
    if (status !== "authenticated" || !csrfToken) {
      realtime.disconnect();
      return;
    }
    let cancelled = false;
    applyRealtime({ type: "connection", status: "connecting" });
    void ensureLocalDevice(csrfToken)
      .then((device) => {
        if (cancelled) return;
        setDevice(device, null);
        realtime.connect(device.deviceId, csrfToken);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDevice(null, errorMessage(error));
        applyRealtime({ type: "connection", status: "offline" });
      });
    const unsubscribe = realtime.subscribe((event) => {
      if (event.type === "revoked") {
        useCallStore.getState().endLocal();
        void clearDeviceIdentity();
        void clearSignalDevice();
        realtime.disconnect();
      }
      if (event.type === "call") {
        useCallStore.getState().applySignal(event.signal);
        return;
      }
      useChatStore.getState().applyRealtime(event);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      realtime.disconnect();
    };
  }, [applyRealtime, csrfToken, setDevice, status]);
}
