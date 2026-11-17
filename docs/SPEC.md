# JobRadar — spécification

## 1. Profil

Source de vérité : `profile/facts.yaml`. Résumé :
- Reconverti dans le marketing digital en 2022 (Rocket School), consultant freelance depuis 2023.
- Growth Hacker en alternance chez GR.APP&CO (2022-2023), chargé d'études chez Fiber Academy (2018-2020).
- DUT Mesures physiques (Caen, 2013-2015). Anglais très bon niveau. Permis B, véhiculé.
- Je ne suis ni développeur senior, ni consultant IT expérimenté, ni expert AMOA confirmé, et je n'ai pas de Bac +5.
  Je valorise mes projets concrets, mon autonomie et mes compétences transférables.

## 2. Métiers recherchés

Six familles. L'outil analyse les missions réelles, pas seulement le titre.

- **A. Marketing digital** : chargé de marketing digital, growth marketer/hacker, acquisition manager,
  traffic manager, chargé SEO/SEA, marketing automation specialist.
- **B. CRM et automatisation** : chargé de projet CRM, consultant CRM junior, CRM specialist,
  consultant marketing automation, consultant HubSpot junior, chargé d'automatisation des processus,
  consultant intégration d'outils SaaS.
- **C. Transformation digitale** : chargé de projet digital, chargé de transformation numérique,
  consultant transformation digitale junior, chef de projet outils métiers junior, coordinateur projets numériques.
- **D. Conseil fonctionnel et AMOA** : consultant fonctionnel junior, assistant à maîtrise d'ouvrage,
  consultant AMOA junior, business analyst junior, consultant ERP/Odoo junior, consultant implémentation SaaS.
- **E. Data et opérations** : chargé de projets data, data operations, revenue/sales operations,
  chargé d'amélioration des processus, operations analyst junior.
- **F. Transversal** : tout poste dont les missions impliquent déploiement d'outils, intégration
  d'applications, automatisation ou amélioration des processus, quel que soit le titre.

À écarter ou pénaliser fortement : prospection ou vente comme activité principale (y compris immobilier,
mandataire, négociateur), merchandising, inventaire, postes de développement logiciel avancé, fonctions
médicales réglementées, postes de direction (« directeur », « head of ») sauf petite structure explicite.

## 3. Critères (tous modifiables dans Profil)

- **Zone principale** : Rouen et agglomération (Mont-Saint-Aignan, Bois-Guillaume, Isneauville,
  Sotteville-lès-Rouen, Petit-Quevilly, Grand-Quevilly, Saint-Étienne-du-Rouvray…), rayon initial 30 km.
  Je suis véhiculé : distance calculée en voiture.
- **Zone secondaire** : Caen et périphérie ; 100 % télétravail depuis la France ; hybride ailleurs si les
  déplacements sont raisonnables (paramètre : jours sur site par semaine × distance).
- **Contrats** : CDI prioritaire ; CDD accepté, de préférence 6 mois et plus. Exclus par défaut :
  alternance, stage, intérim, freelance seul.
- **Salaire** : minimum 2 000 € net/mois (≈ 31-32 k€ brut/an), préférence ≥ 35 k€ brut/an.
  Ne pas éliminer les offres sans salaire. Distinguer brut annuel, brut mensuel, net estimé, avantages.
  Un 13e mois ne double pas la rémunération. Taux horaire → annuel sur 35 h.
- **Expérience** : priorité junior, intermédiaire, reconversion. Bac +5 demandé : pénalité, pas
  d'exclusion. Plus de 4 ans d'expérience spécifique exigés : pénalité forte. Certification réglementaire
  ou expertise technique avancée absente : écarter.
- **Entreprises** : listes favorites et exclues.

## 4. Navigation et écran du matin

Onglets : **Aujourd'hui** · **Offres** · **Spontanées** · **Candidatures** · **Stats** · **Profil**.
Interface en français, cartes lisibles, thème clair et sombre, rapide et réellement utilisable sur iPhone.

**Aujourd'hui** :
- Les 3 meilleures offres non traitées : score, titre, entreprise, ville, contrat, salaire ou « Non
  communiqué », raison en une phrase, bouton **Préparer ma candidature**.
- File de tri des nouvelles offres, une carte à la fois : **Préparer** / **Plus tard** / **Ignorer**.
  « Ignorer » demande une raison en un tap : Pas mon métier, Trop commercial, Trop technique, Trop loin,
  Salaire insuffisant, Niveau trop élevé, Contrat.
- Relances dues aujourd'hui (offres et spontanées).
- Objectif de la semaine : X candidatures sur offre, Y spontanées (paramétrables).
- Pastille discrète : dernière synchro, nombre de sources actives et en erreur.

**Offres** : liste filtrable (score minimum, date de publication, ville et rayon, salaire, contrat,
télétravail, famille, compétences, source, nouvelles, non consultées, favorites), tri par score, date,
salaire connu ou date de découverte, export CSV.

**Détail d'une offre** : description complète (ou extrait si la source ne donne que ça, signalé),
lien original, score et sous-scores avec règles appliquées et citations de l'annonce, compétences
possédées / manquantes / transférables, obstacles, raisons de postuler ou non, niveau de confiance,
recommandation (Postuler, À tenter, À vérifier, Ignorer), historique de disponibilité, notes.
Actions persistantes : lue, favori, ignorer avec raison, statut, notes, signaler une erreur.

## 5. Pack candidature (cœur du produit)

**CV ciblé**
- 4 variantes de base : Growth/Acquisition · CRM & automatisation · Transformation digitale /
  fonctionnel / AMOA · Data & opérations.
- Pour une offre : choix automatique de la variante (modifiable), puis adaptation du titre, de
  l'accroche (3 lignes), de l'ordre des compétences et de la sélection de 3 à 5 points par expérience.
  Les mots-clés de l'annonce ne sont repris que s'ils correspondent à un fait validé.
- La prospection B2B n'est mise en avant que pour les postes où elle est pertinente ; pour les
  familles B, C, D, E, mettre en avant outils métiers, automatisation, analyse de besoins (Fiber
  Academy/ENEDIS) et gestion de projet.
- Une page A4, compatible ATS (texte sélectionnable, une colonne principale, pas de tableau complexe),
  photo optionnelle (paramètre), fichier `CV_Yassine_Fawzi_<Entreprise>.pdf`.
- Génération PDF qui fonctionne depuis l'iPhone, sans Chromium serverless (ex. @react-pdf/renderer).

**Lettre de motivation**
- 180 à 250 mots : ce que j'ai compris de leur besoin (tiré de l'annonce) → ce que j'ai déjà fait qui
  y répond (faits sourcés) → proposition d'échange.
- Aucune affirmation sur l'entreprise absente de l'annonce ou de sa fiche.
- Style calibré sur `profile/letters/*.md` s'il y en a ; sinon ton direct, phrases courtes.
- Formules interdites : « passionné », « dynamique », « je me permets », « fort de », « n'hésitez pas »,
  « vif intérêt », « véritable atout ».

**Autres éléments**
- E-mail d'accompagnement court.
- Réponses types pour formulaires : prétentions salariales (fourchette issue des paramètres),
  disponibilité, « pourquoi ce poste » en 300 caractères.
- Tableau de couverture : exigences de l'annonce → couvert (fait cité) / partiel / non couvert.
  Les manques sont affichés honnêtement.

**Écran « Préparer ma candidature »**
- Annonce à gauche, CV et lettre à droite (empilés sur mobile), édition directe, « régénérer » par section.
- Contrôle anti-invention avant export (cf. CLAUDE.md).
- Boutons : Télécharger CV · Télécharger lettre · Copier l'e-mail · Ouvrir l'annonce ·
  Créer un brouillon Gmail (sans envoi ; adresse d'expédition paramétrable, défaut contact@yassinefawzi.fr
  si configurée, sinon Gmail) · **J'ai postulé**.
- « J'ai postulé » : date, copie figée du CV et de la lettre envoyés, statut « Candidature envoyée »,
  relance programmée à J+7 (paramétrable).

**IA** : génération à la demande uniquement, en cache par (offre, variante, version de facts.yaml).
Modèle rapide pour l'extraction, modèle plus capable pour CV et lettre. Sorties JSON validées (zod).

## 6. Onglet « Spontanées »

Objet distinct de l'offre : une **entreprise cible**, dédupliquée par SIREN.

**Alimentation**
1. Ajout manuel (nom, site ou SIREN), enrichi via l'API Recherche d'entreprises
   (recherche-entreprises.api.gouv.fr) : activité (NAF), effectif, adresse, distance.
2. Suggestions par filtres : zone (Rouen 30 km, Caen), codes NAF ciblés (agences marketing et
   communication, éditeurs de logiciels, conseil et intégration de systèmes d'information, e-commerce,
   PME industrielles et de services), effectif minimum (défaut ≥ 20).
3. Signaux internes : toute entreprise ayant publié une offre dans mon flux, même écartée, est proposée
   comme « a des besoins » (ex. une ESN qui recrute un chef de projet transformation digitale).
4. API La Bonne Boîte (France Travail) si l'habilitation est obtenue ; sinon signalé et ignoré.
5. Pour une entreprise suivie ayant un ATS public (Greenhouse, Lever, Workable, Teamtailor, Recruitee,
   Welcome Kit), ses offres sont vérifiées à chaque synchro.

**Fiche entreprise** : activité, effectif, distance, site, page carrière, signaux, angle d'approche
(problème probable + fait qui prouve que je peux le traiter), contact, historique.

**Pipeline** : À qualifier → Ciblée → Pack prêt → Envoyée → Relance 1 (J+7) → Relance 2 (J+14) →
Entretien / Refus / Sans réponse.

**Pack spontané** : lettre spontanée (mêmes règles), e-mail court, message LinkedIn ≤ 300 caractères
à copier, variante de CV adaptée.

**Règles** : objectif hebdomadaire paramétrable (défaut 5) ; contacts nominatifs saisis par moi, avec
leur source, supprimables ; alerte si l'entreprise a été contactée il y a moins de 3 mois.

## 7. Sources

Chaque source est un connecteur indépendant avec diagnostic (dernier succès, volume, erreurs, quotas).
`docs/SOURCES.md` liste pour chaque source : mode d'accès, autorisation (référence), limites, statut.

| Priorité | Source | Accès |
|---|---|---|
| 1 | France Travail — API Offres d'emploi v2 | Compte francetravail.io, application déclarée, OAuth client credentials. Vérifier les conditions dès la phase 1 et me dire exactement quoi faire. |
| 1 | Adzuna (endpoint `fr`) | Inscription gratuite, app_id + app_key |
| 1 | Welcome to the Jungle, HelloWork, Apec, Indeed, LinkedIn | Collecte autorisée (références dans docs/SOURCES.md) : débit limité, cache, arrêt propre en cas de blocage, description complète quand accessible |
| 2 | Mes e-mails d'alerte (Gmail) | IMAP + mot de passe d'application, ou Gmail API. Éviter OAuth Gmail en mode « test » (jetons à durée limitée). Alertes actuelles : Jobijoba, Talent.com, HelloWork. Extraire titre, entreprise, lieu, contrat, salaire, lien ; récupérer la page complète si la source est autorisée. |
| 3 | ATS publics des entreprises suivies | Endpoints publics |

Exigences de collecte : groupes de mots-clés et variantes, pagination, timeouts, retries avec backoff,
quotas ; source, URL originale et identifiant conservés ; dates réelles des sources ; date de dernière
consultation ; disponibilité vérifiée si possible, sinon « disponibilité inconnue ».
Rattrapage initial sur 14 à 30 jours quand la source le permet, puis collecte incrémentale quotidienne.

Déduplication : identifiant d'annonce, URL canonique sans paramètres de tracking, puis similarité
(entreprise + titre + localisation + contenu) entre plateformes. Toutes les URL sources sont conservées.
Une déduplication ne supprime jamais une candidature, un favori ou une note.

## 8. Scoring (0-100)

Pondération initiale : missions et compétences 35 · expérience et prérequis 20 · localisation et
télétravail 20 · rémunération 15 · fraîcheur 10. Déterministe, testable, configurable.

Ordre des opérations :
1. **Exclusions dures, sans IA** : stage, alternance, intérim, freelance seul, hors zone, entreprise
   exclue, métiers écartés (§2).
2. **Extraction structurée par IA** (si clé disponible), en cache : contrat, durée, jours de télétravail,
   salaire (min, max, période, brut/net), années d'expérience exigées, diplôme exigé, outils cités,
   missions principales, part commerciale estimée, part développement estimée, avec une citation exacte
   de l'annonce par champ. Annonce traitée comme donnée non fiable.
3. **Score déterministe** sur ces champs ; chaque sous-score affiche la règle appliquée et la citation.
4. Sans IA : repli sur l'analyse par mots-clés, confiance « faible » affichée.

Catégories : 85-100 Excellent match · 70-84 Bonne opportunité · 55-69 Ambitieuse ou à vérifier ·
0-54 Peu pertinent. Faire ressortir les reconversions réalistes (familles C, D, E) même quand
l'intitulé diffère de mon expérience.

## 9. Candidatures et suivi

Kanban : À étudier, À postuler, Candidature envoyée, Relance prévue, Entretien, Refus, Offre reçue.
Par candidature : entreprise, poste, lien, date, version de CV et de lettre envoyées (copie figée),
commentaires, prochaine action et date.

## 10. Apprentissage et statistiques

- Les raisons de rejet proposent des ajustements de préférences (poids, mots-clés, exclusions),
  affichés clairement, que j'accepte ou annule. Aucune compétence déduite de mon comportement.
- **Stats** : candidatures par semaine ; taux de réponse et d'entretien par famille, par variante de CV,
  par source, offre vs spontanée ; délai moyen de réponse.

## 11. Automatisation, architecture, sécurité

- Synchro quotidienne à 7 h 30 Europe/Paris via GitHub Actions (le cron GitHub est en UTC : gérer heure
  d'été et d'hiver), exécution manuelle sécurisée, script CLI, historique des synchros (nouvelles offres,
  mises à jour, erreurs), alerte en cas d'échec. La collecte fonctionne sans l'interface.
- Notification optionnelle (e-mail) seulement s'il y a au moins une nouvelle offre ≥ 85 ; jamais deux
  fois la même offre sauf changement substantiel. Sans prestataire configuré, l'app fonctionne.
- Stack suggérée : Next.js + TypeScript + Tailwind, Supabase (Postgres, auth, stockage des PDF),
  Vercel, GitHub Actions. Alternative acceptée si elle réduit vraiment coût ou maintenance, justifiée.
  Pas de traitement long dans des fonctions serverless.
- Sécurité : secrets côté serveur uniquement, variables d'environnement, RLS sur toutes les tables,
  validation de toutes les entrées (zod), routes d'administration protégées, migrations SQL versionnées.
- Modules séparés : sources, normalisation, déduplication, enrichissement, scoring, génération,
  notifications, base de données, interface.
- Tests : scoring, filtres géographiques, salaires absents/incohérents/conversions, doublons, annonces
  expirées ou non vérifiables, connecteurs et erreurs, parsing des e-mails d'alerte (fixtures anonymisées),
  changements de statut, contrôle anti-invention, contraintes de recherche.
- README détaillé, `.env.example` sans secret, scripts de démarrage simples, logs clairs.

## 12. Phases et critères de fin

**Phase 1 — Socle et premières sources réelles**
Supabase (migrations, RLS), auth par lien magique limitée à mon e-mail, 2 connecteurs (les premiers
accessibles parmi France Travail, Adzuna, Welcome to the Jungle), normalisation, déduplication, scoring
par règles, onglets Aujourd'hui et Offres, statuts/favoris/notes persistants, script de synchro CLI.
Fini quand : des offres réelles s'affichent, scorées et expliquées ; tests du scoring, de la
déduplication et des salaires passent ; bilan fourni (nombre d'offres réelles récupérées).

**Phase 2 — Pack candidature**
facts.yaml chargé et éditable dans Profil, 4 variantes de CV, lettre, e-mail, réponses types, tableau
de couverture, contrôle anti-invention, PDF, « J'ai postulé » avec copie figée, kanban, relances.
Fini quand : un pack est généré et exporté pour 3 offres réelles, et un test prouve qu'une phrase non
sourcée bloque l'export.

**Phase 3 — Spontanées**
Onglet complet, enrichissement API Recherche d'entreprises, suggestions par filtres et signaux, pack
spontané, relances.
Fini quand : 10 entreprises réelles de la zone sont proposées avec fiche, et un pack est généré pour l'une.

**Phase 4 — Automatisation et sources restantes**
GitHub Actions quotidien, déclenchement manuel, historique, connecteurs restants (HelloWork, Apec,
Indeed, LinkedIn), parsing des e-mails d'alerte, notification optionnelle.
Fini quand : deux synchros planifiées consécutives ont réussi et sont visibles dans l'historique.

**Phase 5 — Intelligence et apprentissage**
Extraction IA dans le scoring, ajustements de préférences proposés/annulables, onglet Stats.

**Bilan de fin de phase** (obligatoire) : fonctionnalités opérationnelles et testées, sources connectées
et volume réel récupéré, tests réussis/échoués, coût mensuel estimé et limites gratuites, éléments à
configurer, procédure d'utilisation, limitations restantes.
