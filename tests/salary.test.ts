import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimatedNetMonthly, extractAmounts, formatSalary, normalizeSalary, referenceAnnual } from "../src/lib/normalize/salary";

describe("salaires", () => {
  it("fourchette annuelle publiée en texte", () => {
    const s = normalizeSalary({ raw: "De 30 000 € à 40 000 € par an" })!;
    assert.equal(s.period, "annee");
    assert.equal(s.annualMin, 30000);
    assert.equal(s.annualMax, 40000);
    assert.equal(referenceAnnual(s), 35000);
  });

  it("format France Travail annuel et mensuel", () => {
    const a = normalizeSalary({ raw: "Annuel de 30000.0 Euros à 35000.0 Euros sur 12 mois" })!;
    assert.deepEqual([a.annualMin, a.annualMax, a.period], [30000, 35000, "annee"]);
    const m = normalizeSalary({ raw: "Mensuel de 2500.0 Euros sur 12.0 mois" })!;
    assert.equal(m.period, "mois");
    assert.equal(m.annualMin, 30000);
  });

  it("13e mois : conversion sur 13 mois, sans doubler", () => {
    const s = normalizeSalary({ raw: "2 400 € brut par mois + 13e mois" })!;
    assert.equal(s.months, 13);
    assert.equal(s.annualMin, 31200);
    assert.ok(s.warnings.includes("treizieme_mois"));
  });

  it("taux horaire converti sur 35 h", () => {
    const s = normalizeSalary({ raw: "De 12 € à 14 € de l'heure" })!;
    assert.equal(s.period, "heure");
    assert.equal(s.annualMin, Math.round(12 * 151.67 * 12));
  });

  it("montant net converti en brut et signalé", () => {
    const s = normalizeSalary({ raw: "2 000 € net par mois" })!;
    assert.equal(s.kind, "net");
    assert.ok(s.warnings.includes("brut_estime_depuis_net"));
    assert.equal(s.annualMin, Math.round(24000 / 0.78));
  });

  it("notation en k€ et fourchette abrégée", () => {
    assert.deepEqual(extractAmounts("35-40k€"), [35000, 40000]);
    const s = normalizeSalary({ raw: "35k€ - 42k€ / an" })!;
    assert.deepEqual([s.annualMin, s.annualMax], [35000, 42000]);
  });

  it("salaire absent ou non chiffré → null (pas de zéro)", () => {
    assert.equal(normalizeSalary({ raw: null }), null);
    assert.equal(normalizeSalary({ raw: "Selon profil" }), null);
    assert.equal(formatSalary(null), "Non communiqué");
  });

  it("min et max inversés sont remis dans l'ordre", () => {
    const s = normalizeSalary({ structured: { min: 40000, max: 32000, unit: "YEAR" } })!;
    assert.deepEqual([s.min, s.max], [32000, 40000]);
    assert.ok(s.warnings.includes("min_max_inverses"));
  });

  it("montant incohérent : pas de conversion annuelle", () => {
    const s = normalizeSalary({ structured: { min: 2200, max: null, unit: "YEAR" } })!;
    assert.ok(s.warnings.includes("montant_incoherent"));
    assert.equal(referenceAnnual(s), null);
  });

  it("une estimation de la source n'est jamais traitée comme publiée", () => {
    const s = normalizeSalary({ structured: { min: 38000, max: 42000, unit: "YEAR", estimated: true } })!;
    assert.equal(s.estimated, true);
    assert.equal(referenceAnnual(s), null);
    assert.match(formatSalary(s), /estimation/);
  });

  it("données structurées : brut supposé et signalé", () => {
    const s = normalizeSalary({ structured: { min: 28000, max: 32000, unit: "YEAR" } })!;
    assert.equal(s.kind, "brut");
    assert.ok(s.warnings.includes("brut_suppose"));
  });

  it("net mensuel estimé depuis le brut annuel", () => {
    assert.equal(estimatedNetMonthly(31000), Math.round((31000 * 0.78) / 12));
  });
});

describe("salaires — données structurées en texte", () => {
  it("convertit « 34 000,00 » en nombre", () => {
    const s = normalizeSalary({ structured: { min: "34 000,00", max: null, unit: "YEAR" } })!;
    assert.equal(s.annualMin, 34000);
    assert.equal(formatSalary(s).replace(/\s/g, " "), "34 000 € brut/an");
  });
  it("montant incohérent affiché comme tel", () => {
    const s = normalizeSalary({ raw: "500 € / an" })!;
    assert.match(formatSalary(s), /incohérent/);
  });
});
