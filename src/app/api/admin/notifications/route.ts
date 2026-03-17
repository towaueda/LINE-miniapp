import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  const snap = await adminDb.collection("notifications").orderBy("created_at", "desc").get();
  const total = snap.size;
  const offset = (page - 1) * limit;
  const pageDocs = snap.docs.slice(offset, offset + limit);

  return NextResponse.json({
    notifications: pageDocs.map((d) => ({ id: d.id, ...d.data() })),
    total,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, body, targetUserId, isGlobal } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ error: "title and body required" }, { status: 400 });
    }

    if (!isGlobal && !targetUserId) {
      return NextResponse.json({ error: "targetUserId or isGlobal required" }, { status: 400 });
    }

    await adminDb.collection("notifications").add({
      title,
      body,
      is_global: !!isGlobal,
      target_user_id: isGlobal ? null : targetUserId,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
