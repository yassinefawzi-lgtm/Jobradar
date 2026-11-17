"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

const LINKS = [
  { href: "/", label: "Aujourd'hui" },
  { href: "/offres", label: "Offres" },
  { href: "/diagnostic", label: "Synchro" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/connexion") return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold">
            JobRadar
          </Link>
          <nav className="hidden gap-1 sm:flex" aria-label="Navigation principale">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active(l.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm ${active(l.href) ? "bg-surface-2 font-medium" : "text-text-2 hover:text-text"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-muted hover:text-text">Déconnexion</button>
          </form>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Navigation mobile"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(l.href) ? "page" : undefined}
            className={`py-3 text-center text-sm ${active(l.href) ? "font-semibold text-accent" : "text-text-2"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
