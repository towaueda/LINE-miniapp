import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { nickname, birthYear, area, industry, company, bio, avatarEmoji } = body;

    const updates: Record<string, unknown> = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (birthYear !== undefined) updates.birth_year = birthYear;
    if (area !== undefined) updates.area = area;
    if (industry !== undefined) updates.industry = industry;
    if (company !== undefined) updates.company = company;
    if (bio !== undefined) updates.bio = bio;
    if (avatarEmoji !== undefined) updates.avatar_emoji = avatarEmoji;

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ user: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
