import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPage from "@/app/(app)/chat/page";
import type { ChatMessage } from "@/types";

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

const mockSendMessage = vi.fn();
const mockUseRealtimeChat = vi.fn();
vi.mock("@/hooks/useRealtimeChat", () => ({
  useRealtimeChat: (...args: unknown[]) => mockUseRealtimeChat(...args),
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
  isLiffMode: true,
};

// 未来日（チャット有効）
const FUTURE_DATE = "2099-12-31";
// 過去日（チャット期限切れ）
const PAST_DATE = "2020-01-01";

const defaultMatch = {
  id: "group-1",
  members: [
    { id: "user-1", nickname: "テスト太郎", birthYear: 2000, industry: "it", avatarEmoji: "😀", bio: "" },
    { id: "user-2", nickname: "花子", birthYear: 1995, industry: "finance", avatarEmoji: "🌸", bio: "よろしく" },
    { id: "user-3", nickname: "次郎", birthYear: 1998, industry: "consulting", avatarEmoji: "🎯", bio: "" },
  ],
  date: FUTURE_DATE,
  time: "12:00",
  area: "梅田",
  restaurant: "テストレストラン",
  status: "confirmed" as const,
};

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    senderId: "user-2",
    senderName: "花子",
    text: "こんにちは！",
    timestamp: "12:00",
    isSystem: false,
    ...overrides,
  };
}

function setupDefaultRealtimeChat(messages: ChatMessage[] = []) {
  mockUseRealtimeChat.mockReturnValue({
    messages,
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
    sendMessage: mockSendMessage,
  });
}

describe("ChatPage - 実際のユーザー操作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseLiff.mockReturnValue(defaultLiff);
    setupDefaultRealtimeChat();
    vi.mocked(apiFetch).mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── マッチなし状態 ──────────────────────────────
  describe("マッチなし（localStorage にデータがない）", () => {
    it("「マッチしていません」メッセージが表示される", async () => {
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText("マッチしていません")).toBeInTheDocument();
      });
    });

    it("nickname あり → 「マッチングへ」ボタンが表示される", async () => {
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "マッチングへ" })).toBeInTheDocument();
      });
    });

    it("nickname なし → 「プロフィールを記入する」ボタンが表示される", async () => {
      mockUseLiff.mockReturnValue({
        ...defaultLiff,
        user: { ...defaultUser, nickname: "" },
      });
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "プロフィールを記入する" })).toBeInTheDocument();
      });
    });

    it("「マッチングへ」クリック → /matching に遷移", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: "マッチングへ" })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "マッチングへ" }));
      expect(mockPush).toHaveBeenCalledWith("/matching");
    });
  });

  // ─── チャット画面（正常系） ───────────────────────
  describe("チャット画面（マッチあり・期限内）", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("メンバー名・レストラン・日付がヘッダーに表示される", async () => {
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText(/テストレストラン/)).toBeInTheDocument();
      });
    });

    it("メッセージ一覧が表示される", async () => {
      setupDefaultRealtimeChat([makeMessage({ text: "よろしくお願いします" })]);
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText("よろしくお願いします")).toBeInTheDocument();
      });
    });

    it("システムメッセージが中央表示される", async () => {
      setupDefaultRealtimeChat([
        makeMessage({ id: "sys-1", senderId: "system", senderName: "システム", text: "マッチング成立！", isSystem: true }),
      ]);
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText("マッチング成立！")).toBeInTheDocument();
      });
    });

    it("restaurant が「未定」→ お店未定バナーが表示される", async () => {
      localStorage.setItem("triangle_match", JSON.stringify({ ...defaultMatch, restaurant: "未定" }));
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText(/お店がまだ決まっていません/)).toBeInTheDocument();
      });
    });

    it("入力フィールドが表示される", async () => {
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument();
      });
    });

    it("「ランチ完了 → レビューへ」ボタンが表示される", async () => {
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /ランチ完了/ })).toBeInTheDocument();
      });
    });
  });

  // ─── テキスト入力・送信インタラクション ──────────
  describe("メッセージ送信インタラクション", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("テキスト入力前 → 送信ボタンが disabled", async () => {
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument());

      // disabled 属性で確認
      const inputEl = screen.getByPlaceholderText("メッセージを入力...");
      expect(inputEl).toBeInTheDocument();
      // 送信ボタンは disabled クラスを持つ
      const buttons = screen.getAllByRole("button");
      const sendButton = buttons.find(btn => btn.className.includes("bg-line") && btn.className.includes("rounded-full"));
      expect(sendButton).toBeDisabled();
    });

    it("テキスト入力後 → 送信ボタンが有効になる", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument());

      await ue.type(screen.getByPlaceholderText("メッセージを入力..."), "テストメッセージ");

      const buttons = screen.getAllByRole("button");
      const sendButton = buttons.find(btn => btn.className.includes("bg-line") && btn.className.includes("rounded-full"));
      expect(sendButton).not.toBeDisabled();
    });

    it("送信ボタンクリック → sendMessage が呼ばれる", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument());

      await ue.type(screen.getByPlaceholderText("メッセージを入力..."), "こんにちは");

      const buttons = screen.getAllByRole("button");
      const sendButton = buttons.find(btn => btn.className.includes("bg-line") && btn.className.includes("rounded-full"));
      await ue.click(sendButton!);

      expect(mockSendMessage).toHaveBeenCalledWith("こんにちは");
    });

    it("Enter キー押下 → sendMessage が呼ばれる", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument());

      const input = screen.getByPlaceholderText("メッセージを入力...");
      await ue.type(input, "こんにちは{Enter}");

      expect(mockSendMessage).toHaveBeenCalledWith("こんにちは");
    });

    it("送信後 → 入力フィールドがクリアされる", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument());

      const input = screen.getByPlaceholderText("メッセージを入力...") as HTMLInputElement;
      await ue.type(input, "テスト");
      await ue.keyboard("{Enter}");

      await waitFor(() => {
        expect(input.value).toBe("");
      });
    });
  });

  // ─── チャット期限切れ ─────────────────────────────
  describe("チャット期限切れ", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify({ ...defaultMatch, date: PAST_DATE }));
    });

    it("期限切れバナーが表示される", async () => {
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getAllByText("チャット期間が終了しました").length).toBeGreaterThan(0);
      });
    });

    it("入力フィールドが非表示になる", async () => {
      render(<ChatPage />);
      await waitFor(() => expect(screen.queryByPlaceholderText("メッセージを入力...")).not.toBeInTheDocument());
    });

    it("「ランチ完了」ボタンが非表示になる", async () => {
      render(<ChatPage />);
      await waitFor(() => expect(screen.queryByRole("button", { name: /ランチ完了/ })).not.toBeInTheDocument());
    });

    it("「レビューへ」ボタンをクリック → /review に遷移", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: "レビューへ" })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: "レビューへ" }));
      expect(mockPush).toHaveBeenCalledWith("/review");
    });
  });

  // ─── ランチ完了 ──────────────────────────────────
  describe("ランチ完了ボタン", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("クリック → /api/matching/complete が呼ばれる", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: /ランチ完了/ })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: /ランチ完了/ }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          "/api/matching/complete",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ groupId: "group-1" }),
          })
        );
      });
    });

    it("クリック後 → /review に遷移", async () => {
      const ue = userEvent.setup();
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByRole("button", { name: /ランチ完了/ })).toBeInTheDocument());

      await ue.click(screen.getByRole("button", { name: /ランチ完了/ }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/review");
      });
    });
  });

  // ─── 自分のメッセージ判定 ────────────────────────
  describe("メッセージの自分/他人判定", () => {
    beforeEach(() => {
      localStorage.setItem("triangle_match", JSON.stringify(defaultMatch));
    });

    it("自分のメッセージ（senderId=user-1）→ 右寄せ表示", async () => {
      setupDefaultRealtimeChat([
        makeMessage({ id: "my-msg", senderId: "user-1", senderName: "テスト太郎", text: "私のメッセージ" }),
      ]);
      render(<ChatPage />);
      await waitFor(() => expect(screen.getByText("私のメッセージ")).toBeInTheDocument());

      const msgEl = screen.getByText("私のメッセージ").closest("div");
      // 自分のメッセージは bg-line クラス（LINE グリーン背景）
      expect(msgEl?.className).toContain("bg-line");
    });

    it("他人のメッセージ → 送信者名が表示される", async () => {
      setupDefaultRealtimeChat([
        makeMessage({ id: "other-msg", senderId: "user-2", senderName: "花子", text: "他人のメッセージ" }),
      ]);
      render(<ChatPage />);
      await waitFor(() => {
        expect(screen.getByText("花子")).toBeInTheDocument();
        expect(screen.getByText("他人のメッセージ")).toBeInTheDocument();
      });
    });
  });
});
