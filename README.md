# JobRadar

Application personnelle de recherche d'emploi : collecte quotidienne d'offres réelles, déduplication, score sur 100 expliqué, tri rapide le matin, suivi des statuts.

- Règles du projet : [CLAUDE.md](CLAUDE.md)
- Spécification et phases : [docs/SPEC.md](docs/SPEC.md)
- Sources et autorisations : [docs/SOURCES.md](docs/SOURCES.md)
- Profil (source de vérité pour CV et lettres, phase 2) : [profile/facts.yaml](profile/facts.yaml)

## État : phases 1 et 2 terminées

| Fonction | État |
|---|---|
| Collecte HelloWork (résultats + détail des offres) | Fonctionne, testée sur des offres réelles |
| Connecteurs France Travail et Adzuna | Code prêt, testé sur données simulées, en attente de clés |
| Normalisation, déduplication, score sur 100 expliqué | Fonctionnent, testés |
| Écrans Aujourd'hui, Offres, Détail, Synchro | Fonctionnent, testés dans Chromium |
| **Pack candidature** : CV ciblé (4 variantes), lettre, e-mail, réponses types, couverture des exigences | Fonctionne sans IA, testé sur 3 offres réelles |
| **Contrôle anti-invention** : export et « J'ai postulé » bloqués tant qu'une phrase n'est pas sourcée | Fonctionne, testé |
| **PDF** CV (1 page A4, compatible ATS) et lettre | Fonctionne, testé |
| « J'ai postulé » : copie figée + relance à J+7, tableau des candidatures, relances sur l'accueil | Fonctionne, testé |
| Profil modifiable dans l'application (validé avant enregistrement) | Fonctionne, testé |
| Rédaction par l'IA (Claude) | Code prêt, testé sur réponses simulées ; **pas encore testé en réel** (clé à fournir) |
| Synchro quotidienne automatique, alertes e-mail, autres sources | Phase 4 |
| Spontanées, Stats | Phases 3 et 5 |

### Pack candidature : comment ça marche

1. Depuis une offre : **Préparer ma candidature**. Le pack est généré à partir de `profile/facts.yaml` uniquement.
2. Chaque phrase affiche ses sources (faits du profil, « annonce », « tes préférences »). Le contrôle bloque :
   phrase sans source, chiffre ou outil absent des faits cités, formule interdite, fait non validé.
3. Tu corriges le texte, ou tu coches « Je confirme que cette phrase est exacte » (tracé).
4. **Télécharger le CV / la lettre** (PDF), **Copier l'e-mail**, **Ouvrir l'annonce**, puis **J'ai postulé** :
   copie figée de ce qui a été envoyé, statut « Candidature envoyée », relance programmée à J+7.
5. Avec `ANTHROPIC_API_KEY`, l'IA (Claude Opus 5.5) réécrit le brouillon pour l'offre ; le même contrôle s'applique.
   Coût estimé : quelques centimes par pack ; plafond mensuel `AI_MONTHLY_BUDGET_EUR` (10 € par défaut), au-delà rédaction sans IA.

## Démarrer en local

Prérequis : Node.js 22+, pnpm 10+, PostgreSQL 16 (ou un projet Supabase).

```sh
pnpm install
cp .env.example .env.local        # puis renseigner APP_PASSWORD et SESSION_SECRET
pnpm db:local                     # démarre un PostgreSQL local (port 5433) si tu n'utilises pas Supabase
pnpm db:migrate                   # crée les tables
pnpm sync                         # première collecte (30 jours), puis 7 jours aux passages suivants
pnpm dev                          # http://localhost:3200
```

`SESSION_SECRET` : 32 caractères aléatoires minimum, par exemple `openssl rand -hex 32`.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm sync` | Collecte toutes les sources configurées. Options : `--only hellowork`, `--days 30`, `--trigger planifie` |
| `pnpm rescore` | Recalcule salaires normalisés et scores de toutes les offres (après un changement de règles) |
| `pnpm db:migrate` | Applique les migrations SQL de `supabase/migrations` |
| `pnpm test` | Tests unitaires ; avec `TEST_DATABASE_URL` (base dédiée, **vidée**), tests d'intégration en plus |
| `pnpm check` | Lint + types + tests + build |

## Mise en ligne (gratuite)

1. **Supabase** (supabase.com → New project, région Europe). Dans *Project Settings → Database → Connection string*, copier l'URL du **Transaction pooler** (port 6543) : c'est `DATABASE_URL`.
2. Depuis ton ordinateur ou Claude Code : `DATABASE_URL=… pnpm db:migrate`, puis `DATABASE_URL=… pnpm sync`.
3. **Vercel** (vercel.com → Add New Project → importer ce dépôt). Variables d'environnement : `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, et pour l'IA `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys). Déployer.
4. Ouvrir l'URL Vercel sur l'iPhone → *Partager → Sur l'écran d'accueil* pour l'avoir comme une app.

La collecte ne tourne jamais dans Vercel (durées d'exécution limitées) : elle passe par la ligne de commande, puis par GitHub Actions en phase 4.

## Architecture

```text
src/lib/sources/     Connecteurs (HelloWork, France Travail, Adzuna) + client HTTP poli (débit, budget, retries)
src/lib/normalize/   Texte, salaires (brut/net, période, 13e mois, incohérences), contrat, télétravail, URL canonique
src/lib/geo/         Distance (vol d'oiseau) et géocodage via la Géoplateforme IGN, avec cache
src/lib/dedupe/      Détection de doublons inter-sources
src/lib/scoring/     Préférences, dictionnaires de mots-clés, score déterministe et explicable
src/lib/sync/        Orchestration d'une synchronisation, recalcul des scores
src/lib/db/          Client Postgres, requêtes et mutations validées (zod)
src/app/             Pages Next.js (Aujourd'hui, Offres, Détail, Synchro, Connexion) et export CSV
supabase/migrations  Schéma SQL (RLS activée sans politique : rien n'est exposé par l'API publique Supabase)
tests/               Tests node:test (fixtures HelloWork réelles, faux serveurs HTTP, base PostgreSQL)
```

Choix techniques :
- **Accès base côté serveur uniquement** (Postgres direct) plutôt que supabase-js : une seule personne utilise l'outil, aucun accès client à la base n'est nécessaire.
- **Mot de passe unique + cookie signé** plutôt qu'un lien magique : pas de dépendance à un service d'envoi d'e-mails.
- **Score sans IA** pour l'instant : règles déterministes et testées. L'extraction par IA est prévue en phase 5 et ne remplacera pas les règles.

## Limites connues

- Distances calculées **à vol d'oiseau**, pas en voiture.
- Les intitulés écartés dès la page de résultats (commercial, magasin, technique…) sont enregistrés sans description pour économiser les requêtes.
- La disponibilité d'une offre est déduite de sa date limite et de sa présence dans les résultats ; une offre non revue depuis 21 jours passe en « disponibilité inconnue ».
- Le score repose sur des mots-clés : une annonce rédigée de façon atypique peut être sous- ou sur-évaluée. Le bouton « Signaler une erreur » sert à les repérer.
