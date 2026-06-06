import { NextResponse } from "next/server";
import { generateWorkspaceMarkdown } from "@/lib/services/export.service";

/** Sanitise a filename for use in Content-Disposition.
 *  Strips everything outside [a-z0-9._-] and falls back to "export.md".
 *  This prevents header injection via user-controlled workspace titles.
 */
function safeFilename(name: string): string {
  const sanitised = name
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return sanitised.length > 0 ? sanitised : "export.md";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const result = await generateWorkspaceMarkdown(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  // Use RFC 5987 encoding to safely pass the filename
  const filename = safeFilename(result.data.filename);

  return new NextResponse(result.data.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
