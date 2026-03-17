import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import {
  isValidArea,
  validateNickname,
  validateBio,
  validateCompany,
  validateBirthYear,
  validateIndustry,
  validateAvatarEmoji,
} from "@/lib/validation";

export async function PUT(request: Request) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const body = await bodyPromise;
    const { nickname, birthYear, area, industry, company, bio, avatarEmoji } = body;

    const errors: string[] = [];

    if (nickname !== undefined) {
      const err = validateNickname(nickname);
      if (err) errors.push(err);
    }
    if (birthYear !== undefined) {
      const err = validateBirthYear(birthYear);
      if (err) errors.push(err);
    }
    if (area !== undefined && !isValidArea(area)) {
      errors.push("無効なエリアです");
    }
    if (industry !== undefined) {
      const err = validateIndustry(industry);
      if (err) errors.push(err);
    }
    if (company !== undefined) {
      const err = validateCompany(company);
      if (err) errors.push(err);
    }
    if (bio !== undefined) {
      const err = validateBio(bio);
      if (err) errors.push(err);
    }
    if (avatarEmoji !== undefined) {
      const err = validateAvatarEmoji(avatarEmoji);
      if (err) errors.push(err);
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (nickname !== undefined) updates.nickname = nickname;
    if (birthYear !== undefined) updates.birth_year = birthYear;
    if (area !== undefined) updates.area = area;
    if (industry !== undefined) updates.industry = industry;
    if (company !== undefined) updates.company = company;
    if (bio !== undefined) updates.bio = bio;
    if (avatarEmoji !== undefined) updates.avatar_emoji = avatarEmoji;

    await adminDb.collection("users").doc(user.id).update(updates);

    const updatedDoc = await adminDb.collection("users").doc(user.id).get();
    return NextResponse.json({ user: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
