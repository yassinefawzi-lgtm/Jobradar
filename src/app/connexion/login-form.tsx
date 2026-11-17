"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block text-sm font-medium" htmlFor="password">
        Mot de passe
      </label>
      <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
