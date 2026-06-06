import { NextResponse } from "next/server";
import { generateWorkspaceMarkdown } from "@/lib/services/export.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const result = await generateWorkspaceMarkdown(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return new NextResponse(result.data.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
    },
  });
}
