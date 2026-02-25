import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { groupId } = params;

  // ページネーションパラメータの解析
  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const before = url.searchParams.get("before");

  // メンバーシップ確認 + メッセージ取得を並列実行
  let msgQuery = supabaseAdmin
    .from("messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) {
    msgQuery = msgQuery.lt("created_at", before);
  }

  const [{ data: membership }, { data: rows, error }] = await Promise.all([
    supabaseAdmin
      .from("match_group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single(),
    msgQuery,
  ]);

  if (!membership) {
    return NextResponse.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  }

  if (error) {
    return NextResponse.json({ error: "メッセージの読み込みに失敗しました" }, { status: 500 });
  }

  const allRows = rows || [];
  const hasMore = allRows.length > limit;
  const pageRows = hasMore ? allRows.slice(0, limit) : allRows;

  // 表示用に昇順に並べ替え
  const messages = pageRows.reverse();

  return NextResponse.json({
    messages,
    hasMore,
    nextCursor: hasMore ? pageRows[pageRows.length - 1].created_at : null,
  });
}
