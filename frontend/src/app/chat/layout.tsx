"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { Sidebar } from "@/components/Sidebar";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    } else if (mustChangePassword) {
      router.replace("/change-password");
    }
  }, [token, mustChangePassword, router]);

  if (!token || mustChangePassword) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
