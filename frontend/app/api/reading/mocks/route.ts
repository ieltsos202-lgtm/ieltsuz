import { NextResponse } from "next/server";
import { readdirSync } from "fs";
import { join } from "path";

export async function GET() {
  const mocksDir = join(process.cwd(), "public", "mocks");
  const files = readdirSync(mocksDir)
    .filter((f) => f.toUpperCase().startsWith("R") && f.endsWith(".html"))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || "0", 10);
      return na - nb;
    });

  const mocks = files.map((f) => {
    const id = f.replace(/\.html$/i, "");
    const num = parseInt(id.match(/\d+/)?.[0] || "0", 10);
    return {
      id,
      title: `Reading Test ${num}`,
      slug: id,
      url: `/mocks/${f}`,
    };
  });

  return NextResponse.json({ mocks });
}
