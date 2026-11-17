"use client";

import { useActionState } from "react";
import { saveProfile } from "../actions";

export function ProfileEditor({ yaml }: { yaml: string }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="card space-y-3 p-4">
      <h2 className="font-semibold">Modifier le profil</h2>
      <p className="text-sm text-text-2">
        Format YAML. Chaque fait a un identifiant unique et un statut (<code>valide</code> ou <code>a_confirmer</code>). Un fait à confirmer n&apos;est jamais
        utilisé. Le profil est vérifié avant d&apos;être enregistré.
      </p>
      <textarea name="yaml" defaultValue={yaml} rows={24} spellCheck={false} className="field font-mono text-xs" aria-label="Profil au format YAML" />
      {state?.errors && (
        <ul className="text-sm text-bad">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {state?.ok && <p className="text-sm text-good">Profil enregistré. Les prochains packs l&apos;utiliseront.</p>}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Vérification…" : "Vérifier et enregistrer"}
      </button>
    </form>
  );
}
