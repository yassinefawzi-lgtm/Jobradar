import type { Family } from "./preferences";

/**
 * Dictionnaires de mots-clés, appliqués sur du texte "replié" (minuscules, sans accents).
 * Les compétences possédées renvoient aux identifiants de profile/facts.yaml.
 */

export interface SkillDef {
  label: string;
  patterns: RegExp[];
  /** Identifiant de fait (profile/facts.yaml) quand la compétence est possédée. */
  factId?: string;
}

export const OWNED_SKILLS: SkillDef[] = [
  { label: "Google Ads / SEA", patterns: [/\bgoogle ads\b/, /\badwords\b/, /\bsea\b/, /\bsem\b/, /\bliens sponsorises\b/], factId: "comp.ads" },
  { label: "Meta Ads / social ads", patterns: [/\bmeta ads\b/, /\bfacebook ads\b/, /\binstagram ads\b/, /\bsocial ads\b/, /\bpublicite (en ligne|digitale|social)/], factId: "comp.ads" },
  { label: "Acquisition", patterns: [/\bacquisition\b/, /\bgrowth\b/, /\btrafic\b/, /\btraffic\b/, /\bgeneration de leads?\b/, /\blead gen/], factId: "comp.ads" },
  { label: "SEO", patterns: [/\bseo\b/, /\breferencement naturel\b/], factId: "comp.seo" },
  { label: "Contenu / landing pages", patterns: [/\blanding pages?\b/, /\bcopywriting\b/, /\bredaction web\b/, /\bwordpress\b/, /\bwebflow\b/], factId: "comp.seo" },
  { label: "CRM", patterns: [/\bcrm\b/, /\bgestion de la relation client\b/], factId: "comp.crm" },
  { label: "HubSpot", patterns: [/\bhubspot\b/], factId: "comp.hubspot" },
  { label: "n8n", patterns: [/\bn8n\b/], factId: "comp.n8n" },
  { label: "Make / Zapier", patterns: [/\bmake com\b/, /\bintegromat\b/, /\bzapier\b/, /\bno code\b/, /\blow code\b/, /\bnocode\b/], factId: "comp.automatisation" },
  { label: "Automatisation", patterns: [/\bautomatisation\b/, /\bautomatiser\b/, /\bworkflows?\b/, /\bmarketing automation\b/, /\bautomation\b/], factId: "comp.automatisation" },
  { label: "Intégration d'outils / API", patterns: [/\bapi\b/, /\bintegration (d )?(outils|applications|saas)\b/, /\bconnecteurs?\b/, /\binterfacage\b/], factId: "comp.automatisation" },
  { label: "Google Sheets / tableurs", patterns: [/\bgoogle sheets\b/, /\bexcel\b/, /\btableurs?\b/], factId: "comp.automatisation" },
  { label: "Scraping / enrichissement de données", patterns: [/\bscraping\b/, /\benrichissement\b/, /\bqualification (de )?(leads|prospects|donnees)\b/, /\bbase de donnees (clients|prospects)\b/], factId: "comp.data" },
  { label: "IA générative", patterns: [/\bia generative\b/, /\bintelligence artificielle\b/, /\bchatgpt\b/, /\bllm\b/, /\b(outils )?ia\b/], factId: "comp.automatisation" },
  { label: "Emailing", patterns: [/\bemailing\b/, /\be mailing\b/, /\bnewsletters?\b/, /\bcampagnes? (e ?mail|email)\b/], factId: "comp.prospection" },
  { label: "Analyse de besoins", patterns: [/\banalyse (des|de) besoins?\b/, /\brecueil (des )?besoins\b/, /\bexpression (des|de) besoins?\b/, /\bcahier des charges\b/, /\bspecifications? fonctionnelles?\b/], factId: "comp.analyse-besoins" },
  { label: "Gestion de projet", patterns: [/\bgestion de projets?\b/, /\bpilotage (de )?projets?\b/, /\bcoordination\b/, /\bplanning\b/, /\bretroplanning\b/], factId: "comp.analyse-besoins" },
  { label: "Anglais", patterns: [/\banglais\b/, /\benglish\b/], factId: "langue.anglais" },
];

/** Compétences fréquemment demandées que le profil ne revendique pas (affichées comme "manquantes"). */
export const OTHER_SKILLS: SkillDef[] = [
  { label: "Salesforce", patterns: [/\bsalesforce\b/] },
  { label: "SQL", patterns: [/\bsql\b/] },
  { label: "Python", patterns: [/\bpython\b/] },
  { label: "Power BI / Tableau / Looker", patterns: [/\bpower ?bi\b/, /\btableau software\b/, /\blooker\b/, /\bdata ?studio\b/] },
  { label: "Google Analytics / GA4", patterns: [/\bga4\b/, /\bgoogle analytics\b/] },
  { label: "Odoo", patterns: [/\bodoo\b/] },
  { label: "SAP", patterns: [/\bsap\b/] },
  { label: "Figma / Adobe", patterns: [/\bfigma\b/, /\bphotoshop\b/, /\billustrator\b/, /\bindesign\b/, /\badobe\b/] },
  { label: "JavaScript / développement web", patterns: [/\bjavascript\b/, /\btypescript\b/, /\breact\b/, /\bphp\b/] },
  { label: "Brevo / Mailchimp / Klaviyo", patterns: [/\bbrevo\b/, /\bsendinblue\b/, /\bmailchimp\b/, /\bklaviyo\b/] },
  { label: "Gestion de budget / compte de résultat", patterns: [/\bcompte de resultat\b/, /\bgestion budgetaire\b/] },
];

export interface FamilyDef {
  family: Family;
  title: RegExp[];
  body: RegExp[];
}

export const FAMILY_DEFS: FamilyDef[] = [
  {
    family: "A",
    title: [/\bmarketing (digital|numerique|web)\b/, /\bwebmarketing\b/, /\bweb marketing\b/, /\bgrowth\b/, /\bacquisition\b/, /\btraffic manager\b/, /\btrafic manager\b/, /\bseo\b/, /\bsea\b/, /\bsem\b/, /\bdigital marketing\b/, /\bmarketing automation\b/, /\bcampagnes?\b/, /\bmarketing\b/],
    body: [/\bacquisition\b/, /\bgoogle ads\b/, /\bmeta ads\b/, /\bseo\b/, /\bsea\b/, /\bgrowth\b/, /\bcampagnes?\b/, /\btaux de conversion\b/, /\bkpi\b/],
  },
  {
    family: "B",
    title: [/\bcrm\b/, /\bhubspot\b/, /\bmarketing automation\b/, /\bautomatisation\b/, /\bautomation\b/, /\bno code\b/, /\bintegrat(eur|ion)\b/, /\bsaas\b/],
    body: [/\bcrm\b/, /\bhubspot\b/, /\bautomatisation\b/, /\bworkflows?\b/, /\bzapier\b/, /\bmake\b/, /\bn8n\b/, /\bintegration\b/],
  },
  {
    family: "C",
    title: [/\btransformation (digitale|numerique)\b/, /\bprojets? (digital|numerique|digitaux)\b/, /\bchef de projet (digital|numerique|web|outils)\b/, /\boutils metiers?\b/, /\bconseiller numerique\b/, /\bdigitalisation\b/, /\bcoordinat(eur|rice) (projets? )?(numerique|digital)/],
    body: [/\btransformation (digitale|numerique)\b/, /\bdeploiement (d )?outils\b/, /\bconduite du changement\b/, /\bdigitalisation\b/, /\boutils numeriques\b/],
  },
  {
    family: "D",
    title: [/\bamoa\b/, /\bmoa\b/, /\bassistant(e)? (a )?maitrise d ouvrage\b/, /\bconsultant(e)? fonctionnel/, /\bbusiness analyst\b/, /\berp\b/, /\bodoo\b/, /\bimplementation\b/, /\bparametrage\b/, /\bproduct owner\b/],
    body: [/\bamoa\b/, /\brecette\b/, /\bspecifications? fonctionnelles?\b/, /\bcahier des charges\b/, /\bparametrage\b/, /\berp\b/, /\brecueil (des )?besoins\b/],
  },
  {
    family: "E",
    title: [/\bdata\b/, /\boperations?\b/, /\bops\b/, /\brevops\b/, /\bsales ops\b/, /\bprocess(us)?\b/, /\bamelioration continue\b/, /\banalyste?\b/, /\breporting\b/],
    body: [/\breporting\b/, /\btableaux de bord\b/, /\bqualite des donnees\b/, /\bprocessus\b/, /\bamelioration continue\b/, /\boptimisation des process/],
  },
];

/** Signaux "transversaux" (famille F) : missions d'outillage quel que soit le titre. */
export const TRANSVERSAL_BODY: RegExp[] = [
  /\bdeploiement (d |des )?(outils|applications|logiciels)\b/,
  /\bintegration (d |des )?(outils|applications|logiciels)\b/,
  /\bautomatis(er|ation) (des |de )?(taches|processus|process)\b/,
  /\bamelioration (des |de )?(processus|process)\b/,
  /\boutils? (metiers?|internes?|no code)\b/,
];

/** Titres hors cible (docs/SPEC.md §2) : exclusion avec la raison associée. */
export const EXCLUDED_TITLES: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(merchandis|inventori|controleur de stock|employe (libre service|commercial)|hote(sse)? de caisse)/, reason: "Métier hors cible (magasin / inventaire)" },
  { pattern: /\b(negociat(eur|rice) immobilier|mandataire|agent (commercial )?immobilier|conseiller immobilier|commercial immobilier|independant immobilier)\b/, reason: "Trop commercial (immobilier)" },
  { pattern: /\b(commercial|commerciale|vendeur|vendeuse|business developer|business developpeur|charge(e)? d affaires|technico commercial|attache(e)? commercial|teleconseill|televente|teleprospect|sales executive|account executive|ingenieur commercial|developpement commercial|chef de secteur|chef des ventes|directeur commercial|directrice commerciale|responsable commercial|responsable commerciale|ingenieur d affaires|business manager|key account|conseiller de vente|conseillere de vente|assistant commercial|assistante commerciale)\b/, reason: "Trop commercial" },
  { pattern: /\b(developpeur|developer|dev (front|back|full)|ingenieur (logiciel|developpement|devops|systemes?)|devops|data engineer|data scientist|architecte (logiciel|si|cloud|technique)|administrateur (systemes?|reseaux?)|technicien)\b/, reason: "Trop technique" },
  { pattern: /\b(automaticien|endpoints?|helpdesk|support informatique|technicien|ingenieur (methodes|mecanique|electrique|electronique|process|procedes|production|qualite|travaux|etudes|structure|reseaux?|securite|systemes?|cybersecurite|iam|maintenance|calcul)|administrat(eur|rice) (?!crm|fonctionnel|des ventes)\w+)/, reason: "Trop technique" },
  { pattern: /\b(logistique|entrepot|cariste|desamiantage|demolition|btp|genie civil|conducteur de travaux|chef de chantier|gestionnaire de paie|paie|comptabilite|instrumentiste)\b/, reason: "Métier hors cible" },
  { pattern: /\b(infirmi|medecin|pharmacien|aide soignant|kinesitherapeute|sage femme|orthophoniste|psychologue)\b/, reason: "Fonction médicale réglementée" },
  { pattern: /\b(comptable|controleur de gestion|juriste|avocat|notaire|chauffeur|cariste|preparat(eur|rice) de commandes|magasinier|serveur|cuisinier)\b/, reason: "Métier hors cible" },
];

export const ENGINEER_TITLE = /\bingenieur\b/;
export const SENIOR_TITLE = /\b(senior|sr|confirme|experimente|lead|head of|directeur|directrice|director|vp|chief|responsable (du |de |des )?(pole|departement|service))\b/;
export const MANAGER_TITLE = /\b(manager|responsable)\b/;
export const JUNIOR_SIGNALS = /\b(junior|debutant(e)?s? accepte|premiere experience|jeune diplome|reconversion|sans experience|0 a 2 ans|1 a 2 ans|moins de 2 ans)\b/;
export const BAC5_SIGNALS = /\b(bac ?\+ ?5|master|ecole d ingenieurs?|ecole de commerce|grande ecole|mba|diplome d ingenieur)\b/;
export const REGULATED_SIGNALS = /\b(carte professionnelle|diplome d etat|habilitation electrique|certification (pmp|prince2|itil)|inscription a l ordre)\b/;
export const SALES_WORDS = /\b(prospection|prospecter|portefeuille (de )?clients?|chiffre d affaires|objectifs commerciaux|negociation|negocier|closing|vente|vendre|rendez vous (clients|commerciaux)|terrain|commissions?|variable sur objectifs)\b/g;
export const TECH_WORDS = /\b(javascript|typescript|python|java|react|node|php|symfony|laravel|kubernetes|docker|aws|azure|terraform|ci cd|microservices|c\+\+|c#|golang)\b/g;
