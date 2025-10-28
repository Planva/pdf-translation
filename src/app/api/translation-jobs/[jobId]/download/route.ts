import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

import { getSessionFromCookie } from "@/utils/auth";
import { getDB } from "@/db";
import { translationJobTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface RouteParams {
  params: Promise<{ jobId: string }> | { jobId: string };
}

export async function GET(_req: Request, context: RouteParams) {
  const session = await getSessionFromCookie();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { jobId } = await Promise.resolve(context.params);
  const db = getDB();
  const job = await db.query.translationJobTable.findFirst({
    where: eq(translationJobTable.id, jobId),
  });
  if (!job) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const isOwner = job.userId === session.user.id;
  const teamIds = session.teams?.map((team) => team.id) ?? [];
  const isTeamMember = !!job.teamId && teamIds.includes(job.teamId);
  if (!isOwner && !isTeamMember) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!job.outputFileKey) {
    return NextResponse.json({ error: "NOT_READY" }, { status: 400 });
  }
  const filename = job.title ?? job.sourceFileName ?? "translated.pdf";
  const headers = new Headers();
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

  if (job.outputFileKey.startsWith("inline-pdf:")) {
    const base64 = job.outputFileKey.slice("inline-pdf:".length);
    const buffer = Buffer.from(base64, "base64");
    headers.set("Content-Type", "application/pdf");
    return new Response(buffer, { headers });
  }

  const { env } = getCloudflareContext();
  const object = await env.PDF_OUTPUT_BUCKET?.get(job.outputFileKey);
  if (!object) {
    return NextResponse.json({ error: "OUTPUT_NOT_AVAILABLE" }, { status: 404 });
  }

  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/pdf");
  const disposition = object.httpMetadata?.contentDisposition;
  if (disposition) {
    headers.set("Content-Disposition", disposition);
  }
  const arrayBuffer = await object.arrayBuffer();
  return new Response(arrayBuffer, { headers });
}
