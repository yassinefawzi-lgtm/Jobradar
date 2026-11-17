import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Facts } from "../profile/facts";
import type { Pack } from "./pack";

/** PDF du CV (une page A4, une colonne, texte sélectionnable : compatible ATS) et de la lettre. */

const ACCENT = "#2f5bd3";
const st = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 28, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9, lineHeight: 1.3, color: "#18181b" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.1, marginBottom: 3 },
  title: { fontSize: 12, color: ACCENT, marginTop: 2 },
  contact: { fontSize: 8.5, color: "#52525b", marginTop: 4 },
  section: { marginTop: 9 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 9, color: ACCENT, textTransform: "uppercase", letterSpacing: 0.8, borderBottomWidth: 0.6, borderBottomColor: "#d4d4d8", paddingBottom: 2, marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  jobTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  muted: { color: "#52525b" },
  bullet: { flexDirection: "row", marginTop: 2 },
  dot: { width: 9 },
  bulletText: { flex: 1 },
  letterPage: { paddingTop: 50, paddingBottom: 50, paddingHorizontal: 60, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.5, color: "#18181b" },
  para: { marginBottom: 10 },
});

function Bullet({ children }: { children: string }) {
  return (
    <View style={st.bullet}>
      <Text style={st.dot}>•</Text>
      <Text style={st.bulletText}>{children}</Text>
    </View>
  );
}

export function contactLine(f: Facts): string {
  const i = f.identite;
  return [i.telephone, i.email_candidature, i.site, i.linkedin].filter(Boolean).join("  ·  ");
}

export function CvDocument({ pack, facts }: { pack: Pack; facts: Facts }) {
  const id = facts.identite;
  const exps = pack.cv.experiences
    .map((e) => ({ e, src: facts.experiences.find((x) => x.id === e.factId) }))
    .filter((x) => x.src);
  const skillTools = new Map(facts.competences.map((c) => [c.nom, c.outils]));
  return (
    <Document title={`CV ${id.nom}`} author={id.nom} language="fr">
      <Page size="A4" style={st.page}>
        <Text style={st.name}>{id.nom}</Text>
        <Text style={st.title}>{pack.cv.title.text}</Text>
        <Text style={st.contact}>{contactLine(facts)}</Text>
        <Text style={st.contact}>{[id.localisation, id.mobilite].filter(Boolean).join("  ·  ")}</Text>

        {pack.cv.summary.length > 0 && (
          <View style={st.section}>
            <Text>{pack.cv.summary.map((s) => s.text).join(" ")}</Text>
          </View>
        )}

        <View style={st.section}>
          <Text style={st.h2}>Expérience</Text>
          {exps.map(({ e, src }) => (
            <View key={e.factId} style={{ marginBottom: 6 }} wrap={false}>
              <View style={st.row}>
                <Text style={st.jobTitle}>{src!.poste}</Text>
                <Text style={st.muted}>{src!.periode}</Text>
              </View>
              {(src!.entreprise || src!.clients) && <Text style={st.muted}>{src!.entreprise ?? src!.clients}</Text>}
              {e.bullets.map((b, i) => (
                <Bullet key={i}>{b.text}</Bullet>
              ))}
            </View>
          ))}
        </View>

        {pack.cv.projects.length > 0 && (
          <View style={st.section}>
            <Text style={st.h2}>Projets personnels</Text>
            {pack.cv.projects.map((p, i) => (
              <Bullet key={i}>{p.text}</Bullet>
            ))}
          </View>
        )}

        <View style={st.section}>
          <Text style={st.h2}>Compétences</Text>
          {pack.cv.skills.map((label) => {
            const tools = skillTools.get(label) ?? [];
            return (
              <Text key={label} style={{ marginTop: 1 }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{label}</Text>
                {tools.length ? ` : ${tools.join(", ")}` : ""}
              </Text>
            );
          })}
        </View>

        <View style={st.section}>
          <Text style={st.h2}>Formation et langues</Text>
          {facts.formation
            .filter((f) => f.statut === "valide")
            .map((f) => (
              <View key={f.id} style={{ marginBottom: 3 }}>
                <View style={st.row}>
                  <Text style={st.jobTitle}>{f.intitule}</Text>
                  <Text style={st.muted}>{f.periode}</Text>
                </View>
                <Text style={st.muted}>{[f.ecole, f.detail].filter(Boolean).join(" · ")}</Text>
              </View>
            ))}
        </View>

        {id.langues.some((l) => l.statut === "valide") && (
          <Text style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Langues : </Text>
            {id.langues.filter((l) => l.statut === "valide").map((l) => `${l.langue} (${l.niveau})`).join(" · ")}
          </Text>
        )}
      </Page>
    </Document>
  );
}

export function LetterDocument({ pack, facts, company, jobTitle, date }: { pack: Pack; facts: Facts; company: string | null; jobTitle: string; date: Date }) {
  const id = facts.identite;
  const when = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return (
    <Document title={`Lettre ${id.nom}`} author={id.nom} language="fr">
      <Page size="A4" style={st.letterPage}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{id.nom}</Text>
        <Text style={st.muted}>{contactLine(facts)}</Text>
        <Text style={{ marginTop: 24, textAlign: "right" }}>{company ?? ""}</Text>
        <Text style={{ textAlign: "right", marginBottom: 20 }}>Le {when}</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 16 }}>Objet : candidature au poste de {jobTitle}</Text>
        <Text style={st.para}>Madame, Monsieur,</Text>
        {pack.letter.paragraphs.map((p, i) => (
          <Text key={i} style={st.para}>
            {p.map((s) => s.text).join(" ")}
          </Text>
        ))}
        <Text style={st.para}>Je vous prie d&apos;agréer, Madame, Monsieur, mes salutations distinguées.</Text>
        <Text style={{ marginTop: 10 }}>{id.nom}</Text>
      </Page>
    </Document>
  );
}

export async function renderCv(pack: Pack, facts: Facts): Promise<Buffer> {
  return renderToBuffer(<CvDocument pack={pack} facts={facts} />);
}

export async function renderLetter(pack: Pack, facts: Facts, company: string | null, jobTitle: string, date = new Date()): Promise<Buffer> {
  return renderToBuffer(<LetterDocument pack={pack} facts={facts} company={company} jobTitle={jobTitle} date={date} />);
}

export function pdfFileName(kind: "CV" | "Lettre", company: string | null): string {
  const safe = (company ?? "Candidature").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  return `${kind}_Yassine_Fawzi_${safe || "Candidature"}.pdf`;
}
