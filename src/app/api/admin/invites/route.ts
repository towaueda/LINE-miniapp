import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyAdmin } from "../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  const snap = await adminDb.collection("invite_codes").orderBy("created_at", "desc").get();
  const total = snap.size;
  const offset = (page - 1) * limit;
  const pageDocs = snap.docs.slice(offset, offset + limit);

  // 生成者・使用者のニックネームを取得
  const userIdsSet = new Set(pageDocs.flatMap((d) => {
    const data = d.data();
    return [data.generated_by, data.used_by].filter(Boolean) as string[];
  }));
  const userIds = Array.from(userIdsSet);

  const userDocs = await Promise.all(
    userIds.map((uid) => adminDb.collection("users").doc(uid).get())
  );
  const userMap: Record<string, string> = {};
  userDocs.forEach((d) => {
    if (d.exists) userMap[d.id] = d.data()!.nickname || "";
  });

  const invites = pageDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      generator: data.generated_by ? { nickname: userMap[data.generated_by] || null } : null,
      consumer: data.used_by ? { nickname: userMap[data.used_by] || null } : null,
    };
  });

  return NextResponse.json({ invites, total, page, limit });
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { count: batchCount } = await request.json();
    const num = Math.min(Math.max(parseInt(batchCount) || 1, 1), 100);

    const now = new Date().toISOString();
    const codes: string[] = [];
    const batch = adminDb.batch();

    for (let i = 0; i < num; i++) {
      const code = `TRI-${randomBytes(3).toString("hex").toUpperCase()}`;
      codes.push(code);
      const ref = adminDb.collection("invite_codes").doc();
      batch.set(ref, {
        code,
        generated_by: null,
        group_id: null,
        used_by: null,
        used_at: null,
        is_active: true,
        created_at: now,
      });
    }

    await batch.commit();
    return NextResponse.json({ success: true, count: num, codes });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
