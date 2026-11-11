import { ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import type { EncryptionState } from "@/services/encryption.service";
import { cn } from "@/lib/utils";

const copy: Record<EncryptionState, { label: string; detail: string; icon: typeof ShieldOff }> = {
  unavailable: {
    label: "Encryption unavailable",
    detail: "Signal Protocol is not active on this client.",
    icon: ShieldOff,
  },
    unverified: {
      label: "Encrypted, identity unverified",
      detail: "Messages are encrypted with the Signal protocol. The safety number has not been compared.",
      icon: ShieldAlert,
    },
  verified: {
    label: "Encrypted and verified",
    detail: "The identity matches a safety number you verified.",
    icon: ShieldCheck,
  },
};

export function EncryptionIndicator({ state, layout = "inline", detail }: { state: EncryptionState; layout?: "inline" | "card"; detail?: string }) {
  const item = copy[state];
  const Icon = item.icon;
  const tone = state === "verified" ? "text-[var(--online)]" : state === "unverified" ? "text-amber-400" : "text-[var(--muted)]";
  if (layout === "card") {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-[var(--bg)] px-3 py-3" title={detail ?? item.detail}>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--hover)]", tone)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text)]">{item.label}</span>
          <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{detail ?? item.detail}</span>
        </span>
      </div>
    );
  }
  return (
    <p className={cn("inline-flex items-center gap-2 text-xs", tone)} title={item.detail}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.label}</span>
    </p>
  );
}
