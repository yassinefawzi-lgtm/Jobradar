# Sources

État vérifié le 17/11/2026 depuis l'environnement de développement.

| Source | Mode d'accès | Autorisation (référence) | Limites appliquées | Statut |
|---|---|---|---|---|
| HelloWork | Pages de résultats + pages d'offre (données schema.org JobPosting) | Autorisation déclarée par Yassine — **référence à compléter** | 1 requête / 1,5 s, 150 requêtes max par synchro, arrêt sur 401/403, offres déjà connues non re-téléchargées, offres écartées sur l'intitulé non détaillées | **Connectée et testée** (172 offres réelles collectées le 17/11/2026) |
| France Travail — Offres d'emploi v2 | API officielle (OAuth2) | Conditions d'utilisation de l'API | Une requête par recherche (150 résultats max) | Code prêt et testé sur données simulées ; **en attente d'identifiants** |
| Adzuna | API officielle | Conditions d'utilisation de l'API | 2 pages × 50 résultats par recherche | Code prêt et testé sur données simulées ; **en attente de clés** |
| Welcome to the Jungle | À définir | Autorisation déclarée par Yassine — **référence à compléter** | — | Non commencé (phase 4) |
| Apec | À définir | Autorisation déclarée par Yassine — **référence à compléter** | — | Non commencé (phase 4). Le site répond 403 à un client simple. |
| Indeed | À définir | Autorisation déclarée par Yassine — **référence à compléter** | — | Non commencé (phase 4). Le site répond 403 à un client simple. |
| LinkedIn | À définir | Autorisation déclarée par Yassine — **référence à compléter** | — | Non commencé (phase 4) |
| E-mails d'alerte (Gmail) | IMAP / Gmail API | Ma propre boîte | Mise à la corbeille après ingestion réussie | Non commencé (phase 4) |
| API Recherche d'entreprises | API publique (data.gouv.fr) | Licence ouverte | — | Phase 3 |
| La Bonne Boîte | API France Travail (habilitation) | À demander | — | Non disponible |
| Géoplateforme IGN (géocodage) | API publique, sans clé | Licence ouverte | Résultats mis en cache en base | Utilisée (calcul des distances) |

## Notes

- **HelloWork** : le `robots.txt` du site interdit aux robots génériques les pages de recherche (`/fr-fr/emploi/recherche.html`) ; les pages d'offre ne sont pas concernées. Le connecteur s'appuie donc sur l'autorisation que tu as obtenue : merci d'en noter la référence ci-dessus. Il peut être coupé à tout moment avec `SOURCE_HELLOWORK_ENABLED=0`.
- Aucun connecteur ne contourne de CAPTCHA, d'authentification ou de limite de débit : un refus (401/403) arrête la source pour la synchro en cours et apparaît dans le diagnostic.
