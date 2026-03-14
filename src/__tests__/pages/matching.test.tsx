import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MatchingPage from "@/app/(app)/matching/page";

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
const loggedInUser = {
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
  user: loggedInUser,
  dbUser: { id: "db-1" },
  isReady: true,
  isLiffMode: false, // checkStatus をスキップするため
};

// マッチング成立レスポンスのファクトリ
function makeMatchedResponse() {
  return {
    status: "matched",
    group: {
      id: "g1",
      area: "umeda",
      date: "2026-03-19",
      time: "12:00",
      restaurant_name: "テストレストラン",
      status: "confirmed",
    },
    members: [
      { id: "user-1", nickname: "テスト太郎", birth_year: 2000, industry: "it", avatar_emoji: "😀", bio: "" },
      { id: "user-2", nickname: "花子", birth_year: 1995, industry: "finance", avatar_emoji: "🌸", bio: "よろしく" },
      { id: "user-3", nickname: "次郎", birth_year: 1998, industry: "consulting", avatar_emoji: "🎯", bio: "" },
    ],
  };
}

describe("MatchingPage - 実際のユーザー操作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseLiff.mockReturnValue(defaultLiff);
  });

  // ─── 初期表示 ─────────────────────────────────────
  describe("初期表示", () => {
    it("プロフィール完成 → 検索フォームが表示される", async () => {
      render(<MatchingPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "マッチングを探す" })).toBeInTheDocument();
      });
    });

    it("ログイン済み → ルートへのリダイレクトなし", async () => {
      render(<MatchingPage />);
      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    it("プロフィール未完成（nickname なし）→ バナーと設定ボタンが表示される", async () => {
      mockUseLiff.mockReturnValue({
        ...defaultLiff,
        user: { ...loggedInUser, nickname: "" },
      });
      render(<MatchingPage />);
      await waitFor(() => {
        expect(screen.getByText("プロフィール未完成")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "プロフィールを設定する" })).toBeInTheDocument();
      });
    });

    it("「プロフィールを設定する」クリック → /profile に遷移", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({
        ...defaultLiff,
        user: { ...loggedInUser, nickname: "" },
      });
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: "プロフィールを設定する" })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "プロフィールを設定する" }));
      expect(mockPush).toHaveBeenCalledWith("/profile");
    });

    it("isLiffMode=true & checkStatus → hasPendingReview → バナー表示", async () => {
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      vi.mocked(apiFetch).mockResolvedValue({ status: "idle", hasPendingReview: true });

      render(<MatchingPage />);
      await waitFor(() => {
        expect(screen.getByText("レビュー未完了")).toBeInTheDocument();
      });
    });

    it("「レビューページへ」クリック → /review に遷移", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      vi.mocked(apiFetch).mockResolvedValue({ status: "idle", hasPendingReview: true });

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: "レビューページへ" })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "レビューページへ" }));
      expect(mockPush).toHaveBeenCalledWith("/review");
    });
  });

  // ─── 日程選択 ────────────────────────────────────
  describe("日程選択インタラクション", () => {
    it("木曜日ボタンがレンダリングされている", async () => {
      render(<MatchingPage />);
      await waitFor(() => {
        const dateButtons = screen.getAllByRole("button", { name: /(木)/ });
        expect(dateButtons.length).toBeGreaterThan(0);
      });
    });

    it("日程ボタンをクリック → 選択状態（bg-orange）になる", async () => {
      const ue = userEvent.setup();
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      const dateButtons = screen.getAllByRole("button", { name: /(木)/ });
      await ue.click(dateButtons[0]);

      expect(dateButtons[0].className).toContain("bg-orange");
    });

    it("選択済みボタンを再クリック → 選択解除される", async () => {
      const ue = userEvent.setup();
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      const dateButtons = screen.getAllByRole("button", { name: /(木)/ });
      await ue.click(dateButtons[0]);
      expect(dateButtons[0].className).toContain("bg-orange");

      await ue.click(dateButtons[0]);
      expect(dateButtons[0].className).not.toContain("bg-orange");
    });

    it("複数の日程を選択できる", async () => {
      const ue = userEvent.setup();
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThanOrEqual(2));

      const dateButtons = screen.getAllByRole("button", { name: /(木)/ });
      await ue.click(dateButtons[0]);
      await ue.click(dateButtons[1]);

      expect(dateButtons[0].className).toContain("bg-orange");
      expect(dateButtons[1].className).toContain("bg-orange");
    });
  });

  // ─── エリア選択 ──────────────────────────────────
  describe("エリア選択インタラクション", () => {
    it("ユーザーのエリアが初期選択状態", async () => {
      render(<MatchingPage />);
      await waitFor(() => {
        // umeda = "梅田"
        expect(screen.getByRole("button", { name: "梅田" }).className).toContain("bg-orange");
      });
    });

    it("別のエリアをクリック → そちらが選択状態になる", async () => {
      const ue = userEvent.setup();
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: "難波" })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "難波" }));

      expect(screen.getByRole("button", { name: "難波" }).className).toContain("bg-orange");
      expect(screen.getByRole("button", { name: "梅田" }).className).not.toContain("bg-orange");
    });
  });

  // ─── 送信ボタンの活性/非活性 ─────────────────────
  describe("マッチングボタンの活性状態", () => {
    it("日程未選択 → ボタンが disabled", async () => {
      render(<MatchingPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "マッチングを探す" })).toBeDisabled();
      });
    });

    it("日程選択後 → ボタンが有効になる", async () => {
      const ue = userEvent.setup();
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);

      expect(screen.getByRole("button", { name: "マッチングを探す" })).not.toBeDisabled();
    });

    it("プロフィール未完成 → 日程選択してもボタンが disabled", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({
        ...defaultLiff,
        user: { ...loggedInUser, industry: "" },
      });
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);

      expect(screen.getByRole("button", { name: "マッチングを探す" })).toBeDisabled();
    });
  });

  // ─── マッチングリクエスト送信 ─────────────────────
  describe("マッチングリクエスト送信", () => {
    it("ボタン押下 → POST /api/matching/request が呼ばれる", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockResolvedValue({ status: "waiting" });

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          "/api/matching/request",
          expect.objectContaining({ method: "POST" })
        );
      });
    });

    it("リクエスト中 → ボタンが「マッチング中...」に変わる", async () => {
      const ue = userEvent.setup();
      // apiFetch が解決しない状態（ローディング継続）
      vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));

      await waitFor(() => {
        expect(screen.getByText("マッチング中...")).toBeInTheDocument();
      });
    });

    it("waiting レスポンス → 「マッチング待ち」画面に遷移", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockResolvedValue({ status: "waiting" });

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));

      await waitFor(() => {
        expect(screen.getByText("マッチング待ち")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "キャンセルする" })).toBeInTheDocument();
      });
    });

    it("matched レスポンス → 「マッチング成立！」画面が表示される", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockResolvedValue(makeMatchedResponse());

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));

      await waitFor(() => {
        expect(screen.getByText("マッチング成立！")).toBeInTheDocument();
        expect(screen.getByText("花子")).toBeInTheDocument();
        expect(screen.getByText("テストレストラン")).toBeInTheDocument();
      });
    });

    it("matched → localStorage に match データが保存される", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockResolvedValue(makeMatchedResponse());

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));

      await waitFor(() => expect(screen.getByText("マッチング成立！")).toBeInTheDocument());
      expect(localStorage.getItem("triangle_match")).not.toBeNull();
    });

    it("API エラー → エラーメッセージが表示される", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockRejectedValue(new Error("network error"));

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));

      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));

      await waitFor(() => {
        expect(screen.getByText(/マッチングリクエストに失敗/)).toBeInTheDocument();
      });
    });
  });

  // ─── waiting 状態のキャンセル ──────────────────────
  describe("マッチング待ちのキャンセル", () => {
    async function goToWaiting(ue: ReturnType<typeof userEvent.setup>) {
      vi.mocked(apiFetch).mockResolvedValue({ status: "waiting" });
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));
      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));
      await waitFor(() => expect(screen.getByText("マッチング待ち")).toBeInTheDocument());
    }

    it("「キャンセルする」クリック → 検索フォームに戻る", async () => {
      const ue = userEvent.setup();
      await goToWaiting(ue);

      vi.mocked(apiFetch).mockResolvedValue({});
      await ue.click(screen.getByRole("button", { name: "キャンセルする" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "マッチングを探す" })).toBeInTheDocument();
      });
    });

    it("isLiffMode=true のキャンセル → /api/matching/cancel が呼ばれる", async () => {
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      const ue = userEvent.setup();

      vi.mocked(apiFetch)
        .mockResolvedValueOnce({ status: "idle" })
        .mockResolvedValueOnce({ status: "waiting" })
        .mockResolvedValueOnce({});

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));
      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));
      await waitFor(() => expect(screen.getByText("マッチング待ち")).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "キャンセルする" }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith("/api/matching/cancel", { method: "POST" });
      });
    });
  });

  // ─── マッチング成立後の操作 ───────────────────────
  describe("マッチング成立後の操作", () => {
    async function goToMatched(ue: ReturnType<typeof userEvent.setup>) {
      vi.mocked(apiFetch).mockResolvedValue(makeMatchedResponse());
      render(<MatchingPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /(木)/ }).length).toBeGreaterThan(0));
      await ue.click(screen.getAllByRole("button", { name: /(木)/ })[0]);
      await ue.click(screen.getByRole("button", { name: "マッチングを探す" }));
      await waitFor(() => expect(screen.getByText("マッチング成立！")).toBeInTheDocument());
    }

    it("「グループチャットへ」クリック → /chat に遷移", async () => {
      const ue = userEvent.setup();
      await goToMatched(ue);

      await ue.click(screen.getByRole("button", { name: "グループチャットへ" }));
      expect(mockPush).toHaveBeenCalledWith("/chat");
    });

    it("「別の日程で探す」クリック → 検索フォームに戻る", async () => {
      const ue = userEvent.setup();
      await goToMatched(ue);

      await ue.click(screen.getByRole("button", { name: "別の日程で探す" }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "マッチングを探す" })).toBeInTheDocument();
      });
    });
  });

  // ─── 2人オファー ─────────────────────────────────
  describe("2人オファーへの応答", () => {
    beforeEach(() => {
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
    });

    it("two_person_offered → 提案画面が表示される", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        status: "two_person_offered",
        proposedDates: ["2026-03-19"],
        requestId: "req-1",
      });
      render(<MatchingPage />);
      await waitFor(() => {
        expect(screen.getByText("2人でランチしませんか？")).toBeInTheDocument();
      });
    });

    it("「はい」クリック → accept を送信", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({ status: "two_person_offered", proposedDates: ["2026-03-19"], requestId: "req-1" })
        .mockResolvedValueOnce({ status: "waiting_for_partner" });

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getByText("2人でランチしませんか？")).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: /はい、2人でも行きます/ }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          "/api/matching/two-person-response",
          expect.objectContaining({ body: JSON.stringify({ action: "accept" }) })
        );
      });
    });

    it("「別の日程を探す」クリック → decline を送信 → no_match 画面", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({ status: "two_person_offered", proposedDates: ["2026-03-19"], requestId: "req-1" })
        .mockResolvedValueOnce({ status: "no_match" });

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getByText("2人でランチしませんか？")).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "別の日程を探す" }));

      await waitFor(() => {
        expect(screen.getByText("マッチングなし")).toBeInTheDocument();
      });
    });
  });

  // ─── no_match 画面 ────────────────────────────────
  describe("マッチングなし", () => {
    it("no_match → 「マッチングなし」画面が表示される", async () => {
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      vi.mocked(apiFetch).mockResolvedValue({ status: "no_match" });

      render(<MatchingPage />);
      await waitFor(() => {
        expect(screen.getByText("マッチングなし")).toBeInTheDocument();
      });
    });

    it("「別の日程で探す」クリック → 検索フォームに戻る", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      vi.mocked(apiFetch).mockResolvedValue({ status: "no_match" });

      render(<MatchingPage />);
      await waitFor(() => expect(screen.getByText("マッチングなし")).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "別の日程で探す" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "マッチングを探す" })).toBeInTheDocument();
      });
    });
  });
});
