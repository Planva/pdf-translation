import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/utils/auth";
import { cancelTranslationJob } from "@/server/translation/jobs";

interface RouteParams {
  params: { jobId: string };
}

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await getSessionFromCookie();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const teamIds = session.teams?.map((team) => team.id) ?? [];

  const result = await cancelTranslationJob(params.jobId, session.user.id, teamIds);

  if (!result.ok) {
    switch (result.reason) {
      case "NOT_FOUND":
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      case "FORBIDDEN":
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      case "ALREADY_COMPLETED":
        return NextResponse.json({ error: "ALREADY_COMPLETED" }, { status: 400 });
      default:
        return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
