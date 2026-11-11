import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/ProfileSettings";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <main id="main" className="min-h-0 flex-1 overflow-y-auto bg-[var(--chat)] px-4 py-6 sm:px-8">
      <div className="mx-auto grid max-w-xl gap-4 rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <ProfileSettings />
      </div>
    </main>
  );
}
