import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReviewPage from "@/app/(app)/review/page";

// ── モック ────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockUseLiff = vi.fn();
vi.mock("@/components/LiffProvider", () => ({
  useLiff: () => mockUseLiff(),
}));

import { apiFetch } from "@/lib/api";

// ── テスト共通データ ──────────────────────────────────
const defaultUser = {
  id: "user-1",
  nickname: "テスト太郎",
  area: "umeda",
  industry: "it",
  company: "",
  bio: "",
  avatarEmoji: "😀",
  birthYear: 2000,
  isLoggedIn: true,
};

const defaultLiff = {
  user: defaultUser,
  dbUser: { id: "db-1" },
  isReady: true,
  isLiffMode: false,
};

const defaultMatch = {
  id: "group-1",
  members: [
    { id: "user-1", nickname: "テスト太郎", birthYear: 2000, industry: "it", avatarEmoji: "😀", bio: "" },
    { id: "user-2", nickname: "花子", birthYear: 1995, industry: "finance", avatarEmoji: "🌸", bio: "よろしく" },
    { id: "user-3", nickname: "次郎", birthYear: 1998, industry: "consulting", avatarEmoji: "🎯", bio: "" },
  ],
  date: "2026-03-19",
  time: "12:00",
  area: "梅田",
  restaurant: "テストレストラン",
  status: "confirmed" as const,
};

// 全員分の星を最低1個クリックするヘルパー
async function rateAllMembers(ue: ReturnType<typeof userEvent.setup>) {
  // 各評価カテゴリ（話しやすさ・時間厳守・また会いたい度）の星ボタンをクリック
  // レビュー対象は自分以外のメンバー（花子・次郎）
  const stars = screen.getAllByRole("button", { name: "⭐" });
  // 各対象2名 × 3カテゴリ × 5星 = 30個の星ボタン
  // 各カテゴリの1番目の星をクリックする（1/5 で最低評価）
  // 花子: communication[0], punctuality[5], meetAgain[10]
  // 次郎: communication[15], punctuality[20], meetAgain[25]
  await ue.click(stars[0]);  // 花子 話しやすさ 1
  await ue.click(stars[5]);  // 花子 時間厳守 1
  await ue.click(stars[10]); // 花子 また会いたい度 1
  await ue.click(stars[15]); // 次郎 話しやすさ 1
  await ue.click(stars[20]); // 次郎 時間厳守 1
  await ue.click(stars[25]); // 次郎 また会いたい度 1
}

describe("ReviewPage - 実際のユーザー操作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseLiff.mockReturnValue(defaultLiff);
  });

  // ─── リダイレクト ────────────────────────────────
  describe("リダイレクト条件", () => {
    it("triangle_match なし → /matching に遷移", async () => {
      render(<ReviewPage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/matching");
      });
    });

    it("triangle_review_done あり → レビュー完了画面を表示（リダイレクトしない）", async () => {
      localStorage.setItem("triangle_review_done", "TRI-EXISTING-CODE");
      render(<ReviewPage />);
      await waitFor(() => {
        expect(screen.getByText("レビュー完了！")).toBeInTheDocument();
        expect(screen.getByText("TRI-EXISTING-CODE")).toBeInTheDocument();
      });
    });
  });

  // ─── レビューフォーム ─────────────────────────────
  describe("レビューフォームの表示", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("自分以外のメンバー名が表示される", async () => {
      render(<ReviewPage />);
      await waitFor(() => {
        expect(screen.getByText("花子")).toBeInTheDocument();
        expect(screen.getByText("次郎")).toBeInTheDocument();
        expect(screen.queryByText("テスト太郎")).not.toBeInTheDocument();
      });
    });

    it("各評価項目（話しやすさ・時間厳守・また会いたい度）が表示される", async () => {
      render(<ReviewPage />);
      await waitFor(() => {
        expect(screen.getAllByText("話しやすさ").length).toBe(2); // 2人分
        expect(screen.getAllByText("時間厳守").length).toBe(2);
        expect(screen.getAllByText("また会いたい度").length).toBe(2);
      });
    });

    it("星ボタンが各対象 × 3カテゴリ × 5個 = 30個表示される", async () => {
      render(<ReviewPage />);
      await waitFor(() => {
        const stars = screen.getAllByRole("button", { name: "⭐" });
        expect(stars).toHaveLength(30);
      });
    });

    it("コメント入力欄が表示される", async () => {
      render(<ReviewPage />);
      await waitFor(() => {
        const inputs = screen.getAllByPlaceholderText("ひとことメッセージ");
        expect(inputs).toHaveLength(2); // 2人分
      });
    });
  });

  // ─── 星評価インタラクション ───────────────────────
  describe("星評価インタラクション", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("星クリック → 選択されたスコアが反映される", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      const stars = screen.getAllByRole("button", { name: "⭐" });
      // 花子の「話しやすさ」の3番目（スコア3）をクリック
      await ue.click(stars[2]);

      // grayscale が外れた星が3つになるかを確認
      // スコア3 → 最初の3つは grayscale-0、残りは grayscale
      expect(stars[2].className).toContain("grayscale-0");
      expect(stars[3].className).toContain("grayscale");
    });

    it("高い星をクリック後に低い星をクリック → スコアが更新される", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      const stars = screen.getAllByRole("button", { name: "⭐" });
      await ue.click(stars[4]); // 5
      expect(stars[4].className).toContain("grayscale-0");

      await ue.click(stars[1]); // 2 に変更
      expect(stars[2].className).toContain("grayscale"); // 3番目はグレー
    });
  });

  // ─── 送信ボタンの活性状態 ────────────────────────
  describe("送信ボタンの活性状態", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("全員未評価 → 送信ボタンが disabled", async () => {
      render(<ReviewPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "レビューを送信" })).toBeDisabled();
      });
    });

    it("全員全項目評価済み → 送信ボタンが有効", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "レビューを送信" })).not.toBeDisabled();
      });
    });

    it("一部未評価 → 送信ボタンが disabled のまま", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      const stars = screen.getAllByRole("button", { name: "⭐" });
      // 花子の話しやすさのみ評価
      await ue.click(stars[0]);

      expect(screen.getByRole("button", { name: "レビューを送信" })).toBeDisabled();
    });
  });

  // ─── コメント入力 ─────────────────────────────────
  describe("コメント入力", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("コメントを入力できる", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByPlaceholderText("ひとことメッセージ").length).toBe(2));

      const inputs = screen.getAllByPlaceholderText("ひとことメッセージ");
      await ue.type(inputs[0], "楽しかったです！");

      expect((inputs[0] as HTMLInputElement).value).toBe("楽しかったです！");
    });
  });

  // ─── レビュー送信（非 LIFF モード） ──────────────
  describe("レビュー送信（非 LIFF モード）", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("送信 → 完了画面が表示される", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);
      await ue.click(screen.getByRole("button", { name: "レビューを送信" }));

      await waitFor(() => {
        expect(screen.getByText("レビュー完了！")).toBeInTheDocument();
      });
    });

    it("送信 → 招待コードが「TRI-」で始まる", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);
      await ue.click(screen.getByRole("button", { name: "レビューを送信" }));

      await waitFor(() => {
        const codeEl = screen.getByText(/^TRI-/);
        expect(codeEl).toBeInTheDocument();
      });
    });

    it("送信 → localStorage に招待コードが保存される", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);
      await ue.click(screen.getByRole("button", { name: "レビューを送信" }));

      await waitFor(() => expect(screen.getByText("レビュー完了！")).toBeInTheDocument());
      expect(localStorage.getItem("triangle_review_done")).toMatch(/^TRI-/);
    });
  });

  // ─── レビュー送信（LIFF モード） ─────────────────
  describe("レビュー送信（LIFF モード）", () => {
    beforeEach(() => {
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
      vi.mocked(apiFetch).mockResolvedValue({ inviteCode: "TRI-API-CODE-123" });
    });

    it("送信 → apiFetch POST が呼ばれる", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);
      await ue.click(screen.getByRole("button", { name: "レビューを送信" }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          "/api/reviews/submit",
          expect.objectContaining({ method: "POST" })
        );
      });
    });

    it("送信 → API から返された inviteCode が表示される", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);
      await ue.click(screen.getByRole("button", { name: "レビューを送信" }));

      await waitFor(() => {
        expect(screen.getByText("TRI-API-CODE-123")).toBeInTheDocument();
      });
    });

    it("送信中 → ボタンが「送信中...」に変わる", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "⭐" }).length).toBe(30));

      await rateAllMembers(ue);
      await ue.click(screen.getByRole("button", { name: "レビューを送信" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "送信中..." })).toBeInTheDocument();
      });
    });
  });

  // ─── レビュー完了画面の操作 ───────────────────────
  describe("レビュー完了画面", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_review_done", "TRI-DONE-CODE");
    });

    it("「新しいマッチングを探す」クリック → /matching に遷移", async () => {
      const ue = userEvent.setup();
      render(<ReviewPage />);
      await waitFor(() => expect(screen.getByText("レビュー完了！")).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "新しいマッチングを探す" }));

      expect(mockPush).toHaveBeenCalledWith("/matching");
    });

    it("「新しいマッチングを探す」クリック → localStorage がクリアされる", async () => {
      const ue = userEvent.setup();
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
      localStorage.setItem("triangle_chat", "data");

      render(<ReviewPage />);
      await waitFor(() => expect(screen.getByText("レビュー完了！")).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "新しいマッチングを探す" }));

      expect(localStorage.getItem("triangle_match")).toBeNull();
      expect(localStorage.getItem("triangle_chat")).toBeNull();
      expect(localStorage.getItem("triangle_review_done")).toBeNull();
    });
  });
});
