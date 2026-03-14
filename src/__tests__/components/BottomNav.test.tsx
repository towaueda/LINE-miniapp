import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BottomNav from "@/components/BottomNav";

// next/navigation をモック
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

// next/link をモック（href をそのまま <a> として描画）
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { usePathname } from "next/navigation";

describe("BottomNav", () => {
  it("pathname='/' → null を返す（BottomNav を非表示）", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it("pathname='/matching' → BottomNav が表示される", () => {
    vi.mocked(usePathname).mockReturnValue("/matching");
    render(<BottomNav />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("3つのナビアイテムが表示される", () => {
    vi.mocked(usePathname).mockReturnValue("/matching");
    render(<BottomNav />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
  });

  it("pathname='/matching' → マッチングリンクが active スタイル", () => {
    vi.mocked(usePathname).mockReturnValue("/matching");
    render(<BottomNav />);
    const matchingLink = screen.getByRole("link", { name: /マッチング/ });
    expect(matchingLink.className).toContain("text-orange");
  });

  it("pathname='/chat' → チャットリンクが active スタイル", () => {
    vi.mocked(usePathname).mockReturnValue("/chat");
    render(<BottomNav />);
    const chatLink = screen.getByRole("link", { name: /チャット/ });
    expect(chatLink.className).toContain("text-orange");
    // マッチングは非アクティブ
    const matchingLink = screen.getByRole("link", { name: /マッチング/ });
    expect(matchingLink.className).toContain("text-gray-400");
  });

  it("pathname='/profile' → プロフィールリンクが active スタイル", () => {
    vi.mocked(usePathname).mockReturnValue("/profile");
    render(<BottomNav />);
    const profileLink = screen.getByRole("link", { name: /プロフィール/ });
    expect(profileLink.className).toContain("text-orange");
  });

  it("各リンクの href が正しい", () => {
    vi.mocked(usePathname).mockReturnValue("/matching");
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: /マッチング/ })).toHaveAttribute("href", "/matching");
    expect(screen.getByRole("link", { name: /チャット/ })).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: /プロフィール/ })).toHaveAttribute("href", "/profile");
  });

  it("pathname='/review' → すべてのリンクが非アクティブ", () => {
    vi.mocked(usePathname).mockReturnValue("/review");
    render(<BottomNav />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link.className).toContain("text-gray-400");
    });
  });
});
