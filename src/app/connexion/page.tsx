import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">JobRadar</h1>
      <p className="mt-1 text-sm text-text-2">Accès personnel.</p>
      <LoginForm />
    </main>
  );
}
