import { describe, it, expect } from "vitest";
import { getRandomEmoji, AVATAR_EMOJIS } from "@/lib/emoji";

describe("getRandomEmoji", () => {
  it("AVATAR_EMOJIS に含まれる絵文字を返す", () => {
    // 100回呼んでも常に有効な絵文字が返る
    for (let i = 0; i < 100; i++) {
      const emoji = getRandomEmoji();
      expect(AVATAR_EMOJIS).toContain(emoji);
    }
  });

  it("結果は文字列", () => {
    expect(typeof getRandomEmoji()).toBe("string");
  });

  it("AVATAR_EMOJIS は空でない", () => {
    expect(AVATAR_EMOJIS.length).toBeGreaterThan(0);
  });
});
