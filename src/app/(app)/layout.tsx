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
      <main className="pb-16">{children}</main>
      <BottomNav />
    </LiffProvider>
  );
}
