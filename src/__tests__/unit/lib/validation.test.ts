import { describe, it, expect } from "vitest";
import {
  isValidArea,
  validateDates,
  validateNickname,
  validateBio,
  validateCompany,
  validateBirthYear,
  validateIndustry,
  validateAvatarEmoji,
  validateReviewScore,
  validateReviewComment,
  isValidUUID,
  validateMessageText,
} from "@/lib/validation";

// ─────────────────────────────────────────────
// isValidArea
// ─────────────────────────────────────────────
describe("isValidArea", () => {
  it.each(["umeda", "yodoyabashi", "honmachi", "namba", "tennoji"])(
    '"%s" は有効なエリア',
    (area) => {
      expect(isValidArea(area)).toBe(true);
    }
  );

  it.each(["tokyo", "osaka", "", "UMEDA", "undefined", null, 123])(
    '"%s" は無効なエリア',
    (area) => {
      expect(isValidArea(area)).toBe(false);
    }
  );
});

// ─────────────────────────────────────────────
// validateDates
// ─────────────────────────────────────────────
describe("validateDates", () => {
  // JST で「来週以降の木曜日」を動的に生成する
  function getNextThursday(weeksAhead = 1): string {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
    const day = now.getUTCDay(); // 0=Sun
    const daysUntilThursday = ((4 - day + 7) % 7) + 7 * (weeksAhead - 1) || 7;
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + daysUntilThursday);
    return next.toISOString().split("T")[0];
  }

  function getPastThursday(): string {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const day = now.getUTCDay();
    const daysBack = ((day - 4 + 7) % 7) || 7;
    const past = new Date(now);
    past.setUTCDate(now.getUTCDate() - daysBack);
    return past.toISOString().split("T")[0];
  }

  it("未来の木曜日1件 → valid:true", () => {
    const result = validateDates([getNextThursday(1)]);
    expect(result.valid).toBe(true);
  });

  it("未来の木曜日8件 → valid:true（上限）", () => {
    const dates = Array.from({ length: 8 }, (_, i) => getNextThursday(i + 1));
    const result = validateDates(dates);
    expect(result.valid).toBe(true);
  });

  it("空配列 → エラー", () => {
    const result = validateDates([]);
    expect(result.valid).toBe(false);
  });

  it("非配列 → エラー", () => {
    const result = validateDates("2026-03-20");
    expect(result.valid).toBe(false);
  });

  it("9件以上 → エラー", () => {
    const dates = Array.from({ length: 9 }, (_, i) => getNextThursday(i + 1));
    const result = validateDates(dates);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/8日/);
  });

  it("木曜日以外（金曜日）→ エラー", () => {
    const thu = getNextThursday(1);
    const fri = new Date(thu);
    fri.setUTCDate(fri.getUTCDate() + 1);
    const result = validateDates([fri.toISOString().split("T")[0]]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/木曜日/);
  });

  it("過去の木曜日 → エラー", () => {
    const result = validateDates([getPastThursday()]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/過去/);
  });

  it("無効な日付形式 → エラー", () => {
    const result = validateDates(["2026/03/20"]);
    expect(result.valid).toBe(false);
  });

  it("存在しない日付 → エラー", () => {
    const result = validateDates(["2026-13-01"]);
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateNickname
// ─────────────────────────────────────────────
describe("validateNickname", () => {
  it("1文字 → null", () => expect(validateNickname("A")).toBeNull());
  it("20文字 → null", () => expect(validateNickname("A".repeat(20))).toBeNull());
  it("前後スペースをtrimして1文字 → null", () => expect(validateNickname("  A  ")).toBeNull());

  it("空文字 → エラー", () => expect(validateNickname("")).not.toBeNull());
  it("空白のみ → エラー", () => expect(validateNickname("   ")).not.toBeNull());
  it("21文字 → エラー", () => expect(validateNickname("A".repeat(21))).not.toBeNull());
  it("数値型 → エラー", () => expect(validateNickname(123 as unknown as string)).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateBio
// ─────────────────────────────────────────────
describe("validateBio", () => {
  it("undefined → null（任意項目）", () => expect(validateBio(undefined)).toBeNull());
  it("空文字 → null", () => expect(validateBio("")).toBeNull());
  it("200文字 → null", () => expect(validateBio("A".repeat(200))).toBeNull());
  it("201文字 → エラー", () => expect(validateBio("A".repeat(201))).not.toBeNull());
  it("数値型 → エラー", () => expect(validateBio(123 as unknown as string)).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateCompany
// ─────────────────────────────────────────────
describe("validateCompany", () => {
  it("undefined → null", () => expect(validateCompany(undefined)).toBeNull());
  it("50文字 → null", () => expect(validateCompany("A".repeat(50))).toBeNull());
  it("51文字 → エラー", () => expect(validateCompany("A".repeat(51))).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateBirthYear
// ─────────────────────────────────────────────
describe("validateBirthYear", () => {
  it("null → null（任意）", () => expect(validateBirthYear(null)).toBeNull());
  it("1990 → null（下限）", () => expect(validateBirthYear(1990)).toBeNull());
  it("2005 → null（上限）", () => expect(validateBirthYear(2005)).toBeNull());
  it("1989 → エラー", () => expect(validateBirthYear(1989)).not.toBeNull());
  it("2006 → エラー", () => expect(validateBirthYear(2006)).not.toBeNull());
  it("小数 1995.5 → エラー", () => expect(validateBirthYear(1995.5)).not.toBeNull());
  it("文字列 '1995' → エラー", () => expect(validateBirthYear("1995" as unknown as number)).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateIndustry
// ─────────────────────────────────────────────
describe("validateIndustry", () => {
  it("undefined → null（任意）", () => expect(validateIndustry(undefined)).toBeNull());
  it('"it" → null', () => expect(validateIndustry("it")).toBeNull());
  it('"consulting" → null', () => expect(validateIndustry("consulting")).toBeNull());
  it('"unknown_industry" → エラー', () => expect(validateIndustry("unknown_industry")).not.toBeNull());
  it("数値型 → エラー", () => expect(validateIndustry(1 as unknown as string)).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateAvatarEmoji
// ─────────────────────────────────────────────
describe("validateAvatarEmoji", () => {
  it("undefined → null（任意）", () => expect(validateAvatarEmoji(undefined)).toBeNull());
  it('単一絵文字 "😊" → null', () => expect(validateAvatarEmoji("😊")).toBeNull());
  it('2コードポイント絵文字 → null', () => expect(validateAvatarEmoji("👍")).toBeNull());
  it('"abc"（通常文字3つ）→ エラー', () => expect(validateAvatarEmoji("abc")).not.toBeNull());
  it('空文字 → エラー', () => expect(validateAvatarEmoji("")).not.toBeNull());
  it("数値型 → エラー", () => expect(validateAvatarEmoji(1 as unknown as string)).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateReviewScore
// ─────────────────────────────────────────────
describe("validateReviewScore", () => {
  it.each([1, 2, 3, 4, 5])("スコア %d → null", (score) => {
    expect(validateReviewScore(score, "test")).toBeNull();
  });

  it("0 → エラー（下限未満）", () => expect(validateReviewScore(0, "test")).not.toBeNull());
  it("6 → エラー（上限超）", () => expect(validateReviewScore(6, "test")).not.toBeNull());
  it("1.5（小数）→ エラー", () => expect(validateReviewScore(1.5, "test")).not.toBeNull());
  it('"5"（文字列）→ エラー', () => expect(validateReviewScore("5" as unknown as number, "test")).not.toBeNull());
});

// ─────────────────────────────────────────────
// validateReviewComment
// ─────────────────────────────────────────────
describe("validateReviewComment", () => {
  it("undefined → null（任意）", () => expect(validateReviewComment(undefined)).toBeNull());
  it("空文字 → null", () => expect(validateReviewComment("")).toBeNull());
  it("500文字 → null", () => expect(validateReviewComment("A".repeat(500))).toBeNull());
  it("501文字 → エラー", () => expect(validateReviewComment("A".repeat(501))).not.toBeNull());
});

// ─────────────────────────────────────────────
// isValidUUID
// ─────────────────────────────────────────────
describe("isValidUUID", () => {
  it("有効なUUID v4 → true", () =>
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true));
  it("大文字UUID → true（case-insensitive）", () =>
    expect(isValidUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true));
  it("不正な形式 → false", () => expect(isValidUUID("not-a-uuid")).toBe(false));
  it("空文字 → false", () => expect(isValidUUID("")).toBe(false));
  it("数値型 → false", () => expect(isValidUUID(123)).toBe(false));
});

// ─────────────────────────────────────────────
// validateMessageText
// ─────────────────────────────────────────────
describe("validateMessageText", () => {
  it("通常のテキスト → null", () => expect(validateMessageText("こんにちは")).toBeNull());
  it("1000文字 → null（上限）", () => expect(validateMessageText("A".repeat(1000))).toBeNull());
  it("空文字 → エラー", () => expect(validateMessageText("")).not.toBeNull());
  it("空白のみ → エラー", () => expect(validateMessageText("   ")).not.toBeNull());
  it("1001文字 → エラー", () => expect(validateMessageText("A".repeat(1001))).not.toBeNull());
  it("数値型 → エラー", () => expect(validateMessageText(123 as unknown as string)).not.toBeNull());
});
