import { Suspense } from "react";
import LiffProvider from "@/components/LiffProvider";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LiffProvider>
      <Header />
      <main className="pb-16">
        <Suspense fallback={
          <div className="flex items-center justify-center h-[50vh]">
            <div className="animate-spin w-8 h-8 border-3 border-orange border-t-transparent rounded-full" />
          </div>
        }>
          {children}
        </Suspense>
      </main>
      <BottomNav />
    </LiffProvider>
  );
}
