import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/** Toutes les pages et API sont protégées, sauf la page de connexion et les ressources statiques. */
export async function proxy(req: NextRequest) {
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!connexion|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
