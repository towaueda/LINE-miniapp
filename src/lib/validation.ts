import type { AreaOption } from "@/types";
import { INDUSTRY_OPTIONS } from "@/types/constants";

const VALID_AREAS = new Set<AreaOption>(["umeda", "yodoyabashi", "honmachi", "namba", "tennoji"]);
const VALID_INDUSTRIES = new Set(INDUSTRY_OPTIONS.map((o) => o.value));

// Firestore の自動生成ID（20文字の英数字）
const UUID_RE = /^[0-9a-zA-Z]{20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidArea(v: unknown): v is AreaOption {
  return typeof v === "string" && VALID_AREAS.has(v as AreaOption);
}

/** ISO日付文字列の配列を検証（すべて未来の木曜日であること） */
export function validateDates(dates: unknown): { valid: false; reason: string } | { valid: true; dates: string[] } {
  if (!Array.isArray(dates) || dates.length === 0) {
    return { valid: false, reason: "日付を1つ以上選択してください" };
  }
  if (dates.length > 8) {
    return { valid: false, reason: "最大8日まで選択できます" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const d of dates) {
    if (typeof d !== "string" || !DATE_RE.test(d)) {
      return { valid: false, reason: `無効な日付形式です: ${d}` };
    }
    // 日付文字列をパーツに分解してUTCミッドナイトで比較（タイムゾーン非依存）
    const [year, month, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(dt.getTime())) {
      return { valid: false, reason: `無効な日付です: ${d}` };
    }
    // 曜日はUTC日付文字列のまま判定（タイムゾーンに左右されない）
    if (dt.getUTCDay() !== 4) {
      return { valid: false, reason: `${d} は木曜日ではありません` };
    }
    // 未来の日付のみ許可（JST基準）
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const jstToday = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()));
    if (dt < jstToday) {
      return { valid: false, reason: `${d} は過去の日付です` };
    }
  }

  return { valid: true, dates: dates as string[] };
}

export function validateNickname(v: unknown): string | null {
  if (typeof v !== "string") return "ニックネームは文字列で入力してください";
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 20) return "ニックネームは1〜20文字で入力してください";
  return null;
}

export function validateBio(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "自己紹介は文字列で入力してください";
  if (v.length > 200) return "自己紹介は200文字以内で入力してください";
  return null;
}

export function validateCompany(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "会社名は文字列で入力してください";
  if (v.length > 50) return "会社名は50文字以内で入力してください";
  return null;
}

export function validateBirthYear(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v)) return "生年は整数で入力してください";
  if (v < 1990 || v > 2005) return "生年は1990〜2005の範囲で入力してください";
  return null;
}

export function validateIndustry(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "業種は文字列で入力してください";
  if (!VALID_INDUSTRIES.has(v)) return "無効な業種です";
  return null;
}

export function validateAvatarEmoji(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return "アバターは文字列で入力してください";
  // 絵文字は1〜2つのUnicode文字を許可（マルチコードポイント対応）
  const segments = Array.from(v);
  if (segments.length < 1 || segments.length > 2) return "アバターは絵文字1つを選択してください";
  return null;
}

export function validateReviewScore(v: unknown, field: string): string | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return `${field}は整数で入力してください`;
  if (v < 1 || v > 5) return `${field}は1〜5の範囲で入力してください`;
  return null;
}

export function validateReviewComment(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "コメントは文字列で入力してください";
  if (v.length > 500) return "コメントは500文字以内で入力してください";
  return null;
}

export function isValidUUID(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

export function validateMessageText(v: unknown): string | null {
  if (typeof v !== "string") return "テキストは文字列で入力してください";
  const trimmed = v.trim();
  if (trimmed.length === 0) return "メッセージを入力してください";
  if (trimmed.length > 1000) return "メッセージは1000文字以内で入力してください";
  return null;
}
