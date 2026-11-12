const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(relative) {
  const file = path.resolve(__dirname, "..", relative);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = Module._nodeModulePaths(path.dirname(file));
  instance._compile(output, file);
  return instance.exports;
}

const { updateAmountInput, parseAmount } = load("src/shared/utils/amountInput.ts");
const { toISODate, parseISODate, monthLabel } = load("src/shared/utils/date.ts");
const { formatPct, capitalize } = load("src/shared/utils/format.ts");
const { appendUnique, groupByDate } = load("src/shared/utils/paging.ts");
const { initialsOf } = load("src/shared/utils/profile.ts");
const { buildSpendingSeries } = load("src/shared/utils/spendingChart.ts");

test("updateAmountInput builds an amount digit by digit", () => {
  let v = "0";
  for (const k of ["1", "2", ",", "5"]) v = updateAmountInput(v, k, 7);
  assert.equal(v, "12,5");
  assert.equal(parseAmount(v), 12.5);
});

test("updateAmountInput limits decimals, digits and duplicate commas", () => {
  assert.equal(updateAmountInput("1,25", "3", 7), "1,25");
  assert.equal(updateAmountInput("1,2", ",", 7), "1,2");
  assert.equal(updateAmountInput("1234567", "8", 7), "1234567");
  assert.equal(updateAmountInput("1234567", "8", 9), "12345678");
});

test("updateAmountInput delete falls back to 0", () => {
  assert.equal(updateAmountInput("12", "del", 7), "1");
  assert.equal(updateAmountInput("1", "del", 7), "0");
});

test("ISO date helpers round-trip without timezone drift", () => {
  assert.equal(toISODate(parseISODate("2026-03-09")), "2026-03-09");
  assert.equal(toISODate(new Date(2026, 0, 1)), "2026-01-01");
});

test("monthLabel accepts YYYY-MM and YYYY-MM-DD", () => {
  assert.equal(monthLabel("2026-03"), "Mars 2026");
  assert.equal(monthLabel("2026-12-25"), "Décembre 2026");
});

test("formatPct and capitalize", () => {
  assert.equal(formatPct(12.4), "+12%");
  assert.equal(formatPct(-3.2), "3%");
  assert.equal(capitalize("mars"), "Mars");
});

const { pickRelevantPoints } = load("src/shared/utils/aiPoints.ts");
const {
  toDraftLines,
  linesTotal,
  totalGap,
  toExpensePayloads,
  isLineValid,
} = load("src/shared/utils/receiptItems.ts");

test("pickRelevantPoints keeps only points mentioning the focus", () => {
  const analysis = {
    alerts: [{ message: "Alimentation en hausse" }, { message: "Loisirs stables" }],
    recommendations: [{ title: "Réduire", category: "alimentation" }],
  };
  assert.deepEqual(pickRelevantPoints(analysis, "Alimentation"), [
    "Alimentation en hausse",
    "Réduire",
  ]);
  assert.equal(pickRelevantPoints(analysis).length, 3);
  assert.deepEqual(pickRelevantPoints(analysis, "Transport"), []);
});

test("receipt lines: draft, total, validation and payloads", () => {
  const cats = [{ key: "c1", label: "Alimentation" }, { key: "c2", label: "Hygiène" }];
  const lines = toDraftLines(
    [
      { label: "Lait", amount: 1.5, category: "alimentation" },
      { label: "Savon", amount: 2.5, category: null },
    ],
    cats,
    "c2",
  );
  assert.deepEqual(lines.map((l) => [l.amount, l.categoryKey]), [["1,5", "c1"], ["2,5", "c2"]]);
  assert.equal(linesTotal(lines), 4);

  lines.push({ id: "x", label: "vide", amount: "0", categoryKey: "c1" });
  assert.equal(isLineValid(lines[2]), false);
  assert.equal(linesTotal(lines), 4);

  const payloads = toExpensePayloads(lines, "2026-03-05");
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0], {
    amount: 1.5, category_id: "c1", expense_date: "2026-03-05", note: "Lait",
  });
});

test("totalGap flags only a significant difference with the ticket total", () => {
  assert.equal(totalGap(100, 100.5), null);
  assert.equal(totalGap(80, 100), 20);
  assert.equal(totalGap(80, null), null);
});


const {
  validateAuthForm,
  authErrorMessage,
  sanitizeCode,
  isCodeComplete,
  firebaseErrorMessage,
  isUnknownFirebaseAccount,
} = load("src/shared/utils/authForm.ts");

test("validateAuthForm checks name, email and password length on sign-up", () => {
  const ok = { mode: "register", name: "Awa", email: "awa@x.io", password: "12345678" };
  assert.equal(validateAuthForm(ok), null);
  assert.match(validateAuthForm({ ...ok, name: " " }), /nom/);
  assert.match(validateAuthForm({ ...ok, email: "nope" }), /email/i);
  assert.match(validateAuthForm({ ...ok, password: "short" }), /8 caractères/);
  assert.equal(validateAuthForm({ ...ok, mode: "login", name: "", password: "x" }), null);
});

test("authErrorMessage distinguishes offline, wrong credentials and conflicts", () => {
  assert.match(authErrorMessage({}), /injoignable/);
  assert.equal(
    authErrorMessage({ response: { status: 401, data: { detail: "Email ou mot de passe incorrect" } } }),
    "Email ou mot de passe incorrect",
  );
  assert.match(authErrorMessage({ response: { status: 500, data: {} } }), /erreur/);
});

test("sanitizeCode keeps six digits only", () => {
  assert.equal(sanitizeCode("12a3-45 678"), "123456");
  assert.equal(isCodeComplete("123456"), true);
  assert.equal(isCodeComplete("1234"), false);
});

const { describeTrend } = load("src/shared/utils/trend.ts");

test("describeTrend distinguishes rising, falling, stable and too-short history", () => {
  const base = { drift_score: 0.1, history_months: 6 };
  assert.match(describeTrend({ ...base, trend: 0.2 }).label, /hausse/);
  assert.match(describeTrend({ ...base, trend: -0.2 }).label, /baisse/);
  assert.match(describeTrend({ ...base, trend: 0.01 }).label, /Stable/);
  assert.match(describeTrend({ ...base, trend: 0, history_months: 1 }).label, /Trop tôt/);
  const two = describeTrend({ ...base, trend: 0, history_months: 2, last_change: 0.4 });
  assert.match(two.label, /hausse/);
  assert.match(two.sub, /Indicatif.*\+40/);
  assert.match(describeTrend({ ...base, trend: 0, history_months: 2, last_change: -0.4 }).label, /baisse/);
  assert.match(describeTrend({ ...base, trend: 0, history_months: 2, last_change: null }).label, /Trop tôt/);
  assert.equal(describeTrend({ ...base, trend: 0.2, history_months: null }).label, "↗ En hausse");
  assert.match(describeTrend({ trend: 0.2, drift_score: 0.9, history_months: 6 }).sub, /Dérive/);
  assert.equal(describeTrend(null).label, "—");
});

const { safeRoute, formatHour, stepHour } = load("src/shared/utils/notificationPrefs.ts");

test("safeRoute only accepts known screens", () => {
  assert.equal(safeRoute("/budget"), "/budget");
  assert.equal(safeRoute("/onboarding"), null);
  assert.equal(safeRoute("https://evil.example"), null);
  assert.equal(safeRoute(undefined), null);
});

test("formatHour and stepHour wrap around midnight", () => {
  assert.equal(formatHour(7), "07:00");
  assert.equal(stepHour(23, 1), 0);
  assert.equal(stepHour(0, -1), 23);
  assert.equal(stepHour(20, 2), 22);
});

test("appendUnique adds a new page and ignores items already loaded", () => {
  const first = [{ id: "a" }, { id: "b" }];
  const merged = appendUnique(first, [{ id: "b" }, { id: "c" }]);
  assert.deepEqual(merged.map((x) => x.id), ["a", "b", "c"]);
  assert.equal(appendUnique(merged, []), merged);
  assert.equal(appendUnique(merged, [{ id: "a" }]), merged);
});

test("groupByDate keeps the server order and groups consecutive days", () => {
  const rows = [
    { id: 1, date: "2026-03-05" },
    { id: 2, date: "2026-03-05" },
    { id: 3, date: "2026-03-02" },
  ];
  const groups = groupByDate(rows);
  assert.deepEqual(groups.map((g) => g.date), ["2026-03-05", "2026-03-02"]);
  assert.deepEqual(groups[0].items.map((r) => r.id), [1, 2]);
  assert.deepEqual(groupByDate([]), []);
});

test("groupByDate merges a day split across two pages once they are appended", () => {
  const page1 = [{ id: "a", date: "2026-03-05" }];
  const page2 = [{ id: "b", date: "2026-03-05" }, { id: "c", date: "2026-03-04" }];
  const groups = groupByDate(appendUnique(page1, page2));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items.length, 2);
});

test("initialsOf builds avatar initials from a display name", () => {
  assert.equal(initialsOf("Jean Dupont"), "JD");
  assert.equal(initialsOf("  marie  claire  durand "), "MD");
  assert.equal(initialsOf("joel"), "J");
  assert.equal(initialsOf("Émile"), "É");
  assert.equal(initialsOf(""), "?");
  assert.equal(initialsOf(null), "?");
});

test("buildSpendingSeries projects the month end from pace and habit", () => {
  const daily = [
    { date: "2026-11-02", total: 100 },
    { date: "2026-11-05", total: 100 },
  ];
  const s = buildSpendingSeries({ period: "2026-11", daily, baseline: 600, today: new Date(2026, 10, 10) });
  assert.equal(s.lastDay, 30);
  assert.equal(s.todayDay, 10);
  assert.equal(s.cumulative, 200);
  assert.deepEqual(s.real[0], [0, 0]);
  assert.deepEqual(s.real[2], [2, 100]);
  assert.deepEqual(s.real[10], [10, 200]);
  // pace 20/day * 20 days = 400, habit remaining = 400 -> 200 + 400
  assert.equal(Math.round(s.projectedEnd), 600);
});

test("buildSpendingSeries never projects below what is already spent", () => {
  const s = buildSpendingSeries({
    period: "2026-11",
    daily: [{ date: "2026-11-01", total: 900 }],
    baseline: 300,
    today: new Date(2026, 10, 3),
  });
  assert.ok(s.projectedEnd >= 900);
});

test("buildSpendingSeries handles past and future months", () => {
  const past = buildSpendingSeries({
    period: "2026-09",
    daily: [{ date: "2026-09-30", total: 50 }],
    baseline: 100,
    today: new Date(2026, 10, 10),
  });
  assert.equal(past.todayDay, 30);
  assert.equal(past.cumulative, 50);
  assert.equal(past.projectedEnd, null);

  const future = buildSpendingSeries({ period: "2026-12", daily: [], baseline: 100, today: new Date(2026, 10, 10) });
  assert.equal(future.todayDay, 0);
  assert.equal(future.projectedEnd, null);
});

test("groupAmountInput groups thousands while typing", () => {
  const { groupAmountInput } = load("src/shared/utils/amountInput.ts");
  assert.equal(groupAmountInput("0"), "0");
  assert.equal(groupAmountInput("1250"), "1 250");
  assert.equal(groupAmountInput("1250000,5"), "1 250 000,5");
  assert.equal(groupAmountInput("12,"), "12,");
  assert.equal(groupAmountInput("3500.75"), "3 500,75");
});

test("buildSavingsTrajectory: pace, needed pace and reach date from real contributions", () => {
  const { buildSavingsTrajectory } = load("src/shared/utils/savingsTrajectory.ts");
  const today = new Date(2026, 10, 10, 12);
  const t = buildSavingsTrajectory({
    contributions: [
      { amount: 30000, created_at: "2026-08-15T10:00:00Z" },
      { amount: 30000, created_at: "2026-09-15T10:00:00Z" },
      { amount: 30000, created_at: "2026-10-15T10:00:00Z" },
    ],
    current: 100000,
    target: 400000,
    deadline: "2027-06-30",
    today,
  });
  // 10 000 de départ (100 000 - 90 000 versés)
  assert.equal(t.real[0][1], 10000);
  assert.equal(t.real[t.real.length - 1][1], 100000);
  // 90 000 sur la fenêtre de 3 mois
  assert.ok(Math.abs(t.monthlyPace - 30000) < 600);
  // 300 000 restants sur ~7,6 mois
  assert.ok(t.neededPace > 38000 && t.neededPace < 41000);
  // montant prévu à l'échéance : 100 000 + 30 000 x ~7,6 mois
  assert.ok(t.projectedAtDeadline > 320000 && t.projectedAtDeadline < 335000);
  // au rythme actuel : ~10 mois -> après l'échéance
  assert.ok(t.reachDate > t.deadline);
  assert.equal(t.reached, false);
});

test("buildSavingsTrajectory: reached goal and no contributions", () => {
  const { buildSavingsTrajectory } = load("src/shared/utils/savingsTrajectory.ts");
  const today = new Date(2026, 10, 10);
  const done = buildSavingsTrajectory({
    contributions: [{ amount: 500, created_at: "2026-11-01T08:00:00Z" }],
    current: 500,
    target: 500,
    deadline: "2026-12-31",
    today,
  });
  assert.equal(done.reached, true);
  assert.equal(done.neededPace, null);
  assert.equal(done.reachDate, null);

  const idle = buildSavingsTrajectory({ contributions: [], current: 0, target: 1000, deadline: "2027-01-31", today });
  assert.equal(idle.monthlyPace, 0);
  assert.equal(idle.reachDate, null);
  assert.ok(idle.neededPace > 0);
});

test("buildSavingsTrajectory: server timestamps with microseconds and a brand-new goal", () => {
  const { buildSavingsTrajectory, parseInstant } = load("src/shared/utils/savingsTrajectory.ts");
  assert.equal(parseInstant("2026-11-09T14:34:33.981549+00:00"), Date.UTC(2026, 10, 9, 14, 34, 33, 981));
  const today = new Date(Date.UTC(2026, 10, 10, 12));
  const t = buildSavingsTrajectory({
    contributions: [{ amount: 40000, created_at: "2026-11-09T14:34:33.981549+00:00" }],
    current: 40000,
    target: 2000000,
    deadline: "2027-11-09",
    today,
  });
  // le versement d'hier est bien compté, et l'historique couvre au moins un mois
  assert.equal(t.real.length, 3);
  assert.equal(t.real[1][1], 40000);
  assert.ok(t.today - t.start >= 29 * 86400000);
});

test("expenseTag: optimisable only with a meaningful score, and shows the coefficient", () => {
  const { expenseTag, optimizationCoefficient } = load("src/shared/utils/optimization.ts");
  assert.equal(optimizationCoefficient(0.7234), "0,72");
  assert.equal(optimizationCoefficient(1.4), "1,00");
  assert.deepEqual(expenseTag({ essential: true, opportunity_score: 0.9 }), { kind: "essential", label: "Essentielle" });
  assert.deepEqual(expenseTag({ essential: false, opportunity_score: 0.5 }), { kind: "optimisable", label: "Optimisable · 0,50" });
  assert.deepEqual(expenseTag({ essential: false, opportunity_score: 0.1 }), { kind: "other", label: "Non essentielle" });
  assert.equal(expenseTag(undefined).kind, "other");
});

test("summarizeSeason projects the current month and compares it", () => {
  const { summarizeSeason } = load("src/shared/utils/seasonality.ts");
  const months = [
    { period: "2025-11", total: 200 },
    { period: "2025-12", total: 0 },
    { period: "2026-09", total: 100 },
    { period: "2026-10", total: 300 },
    { period: "2026-11", total: 100 },
  ];
  const s = summarizeSeason(months, "2026-11", new Date(2026, 10, 10));
  assert.equal(s.partial, true);
  assert.equal(Math.round(s.projectedCurrent), 300); // 100 en 10 jours -> 300 sur 30
  assert.equal(s.average, 200); // (200 + 100 + 300) / 3, les mois vides exclus
  assert.equal(Math.round(s.vsAverage * 100), 50);
  assert.equal(s.lastYear.period, "2025-11");
  assert.equal(Math.round(s.vsLastYear * 100), 50);
  assert.equal(s.peak.period, "2026-10");
  assert.equal(s.enough, true);

  const young = summarizeSeason([{ period: "2026-11", total: 50 }], "2026-11", new Date(2026, 10, 10));
  assert.equal(young.enough, false);
  assert.equal(young.average, null);
});

test("dailyAllowance spreads the remaining balance over the days left", () => {
  const { dailyAllowance } = load("src/shared/utils/dailyAllowance.ts");
  const a = dailyAllowance(200000, "2026-11", new Date(2026, 10, 11));
  assert.equal(a.daysLeft, 20); // du 11 au 30 inclus
  assert.equal(a.perDay, 10000);
  assert.equal(dailyAllowance(-5000, "2026-11", new Date(2026, 10, 30)).perDay, 0);
  assert.equal(dailyAllowance(1000, "2026-10", new Date(2026, 10, 11)), null);
});

test("previousRange compares the current month at the same date, a past month in full", () => {
  const { previousRange, relativeChange, shiftPeriod } = load("src/shared/utils/monthCompare.ts");
  assert.equal(shiftPeriod("2026-01", -1), "2025-12");
  assert.deepEqual(previousRange("2026-11", new Date(2026, 10, 11)), {
    period: "2026-10", from: "2026-10-01", to: "2026-10-11", sameDate: true,
  });
  // 31 mars -> février s'arrête au 28
  assert.equal(previousRange("2026-03", new Date(2026, 2, 31)).to, "2026-02-28");
  assert.deepEqual(previousRange("2026-09", new Date(2026, 10, 11)), {
    period: "2026-08", from: "2026-08-01", to: "2026-08-31", sameDate: false,
  });
  assert.equal(relativeChange(112, 100).toFixed(2), "0.12");
  assert.equal(relativeChange(50, 0), null);
});

test("budgetPace compares the share spent with the share of the month elapsed", () => {
  const { budgetPace, compactAmount } = load("src/shared/utils/budgetPace.ts");
  const weeks = [
    { label: "S1", prevu: 100, reel: 85 },
    { label: "S2", prevu: 100, reel: 120 },
    { label: "S3", prevu: 100, reel: 0 },
    { label: "S4", prevu: 100, reel: 0 },
  ];
  // 205 / 400 = 51 % dépensés au 11/30 (37 %) -> trop vite
  const fast = budgetPace(weeks, 205, "2026-11", new Date(2026, 10, 11));
  assert.equal(fast.budget, 400);
  assert.equal(fast.tone, "fast");
  assert.deepEqual(fast.upcoming, [false, false, true, true]); // S3 commence vers le 15
  assert.equal(budgetPace(weeks, 450, "2026-11", new Date(2026, 10, 11)).tone, "over");
  assert.equal(budgetPace(weeks, 100, "2026-11", new Date(2026, 10, 11)).tone, "slow");
  assert.equal(budgetPace(weeks, 148, "2026-11", new Date(2026, 10, 11)).tone, "ok");
  assert.equal(budgetPace(weeks.map((w) => ({ ...w, prevu: 0 })), 10, "2026-11", new Date(2026, 10, 11)).tone, "none");
  assert.equal(compactAmount(85000), "85k");
  assert.equal(compactAmount(1200000), "1,2M");
  assert.equal(compactAmount(2000000), "2M");
  assert.equal(compactAmount(950), "950");
});

test("Firebase errors are readable and unknown accounts trigger the legacy migration", () => {
  assert.equal(firebaseErrorMessage("auth/invalid-credential"), "Email ou mot de passe incorrect");
  assert.match(firebaseErrorMessage("auth/email-already-in-use"), /existe déjà/);
  assert.match(firebaseErrorMessage("auth/network-request-failed"), /injoignable/);
  assert.match(firebaseErrorMessage("auth/whatever"), /Réessayez/);
  assert.ok(isUnknownFirebaseAccount("auth/invalid-credential"));
  assert.ok(!isUnknownFirebaseAccount("auth/too-many-requests"));
});

const { goalChance, normalCdf } = load("src/shared/utils/goalChance.ts");

test("normalCdf matches known values", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1) - 0.1587) < 1e-3);
});

test("goalChance reflects pace, regularity and deadline", () => {
  const today = new Date(2026, 10, 12).getTime();
  const monthly = (amounts) =>
    amounts.map((amount, i) => ({ amount, created_at: new Date(2026, 10 - (amounts.length - 1 - i), 5).toISOString() }));
  const base = { current: 60000, target: 120000, today };
  const in6 = new Date(2027, 4, 12).getTime();

  // 10 000/mois, régulier, 60 000 restants en 6 mois : pile au rythme → ~50 %.
  const even = goalChance({ ...base, contributions: monthly([10000, 10000, 10000, 10000, 10000, 10000]), monthlyPace: 10000, deadline: in6 });
  assert.ok(even.probability > 0.4 && even.probability < 0.6, String(even.probability));

  // 15 000/mois : large avance.
  const ahead = goalChance({ ...base, contributions: monthly([15000, 15000, 15000, 15000]), monthlyPace: 15000, deadline: in6 });
  assert.equal(ahead.tone, "good");

  // Même moyenne mais très irrégulier : moins sûr qu'un versement régulier en avance.
  const bumpy = goalChance({ ...base, contributions: monthly([45000, 0, 0, 15000]), monthlyPace: 15000, deadline: in6 });
  assert.ok(bumpy.probability < ahead.probability);

  // 3 000/mois : très improbable.
  assert.equal(goalChance({ ...base, contributions: monthly([3000, 3000]), monthlyPace: 3000, deadline: in6 }).label, "< 5 %");

  // Cas limites.
  assert.equal(goalChance({ ...base, current: 130000, contributions: [], monthlyPace: 0, deadline: in6 }).label, "100 %");
  assert.equal(goalChance({ ...base, contributions: monthly([5000]), monthlyPace: 5000, deadline: today - 1 }).probability, 0);
  assert.equal(goalChance({ ...base, contributions: [], monthlyPace: 0, deadline: in6 }).probability, null);
});

test("buildMonthCurve accumulates daily spending up to today", () => {
  const { buildMonthCurve } = load("src/shared/utils/monthCurve.ts");
  const daily = [
    { date: "2026-11-02", total: 100 },
    { date: "2026-11-05", total: 50 },
    { date: "2026-10-31", total: 999 },
  ];
  const now = buildMonthCurve(daily, "2026-11", new Date(2026, 10, 6));
  assert.equal(now.days, 30);
  assert.deepEqual(now.cumulative, [0, 100, 100, 100, 150, 150]);
  assert.equal(buildMonthCurve(daily, "2026-11", new Date(2026, 11, 3)).cumulative.length, 30);
  assert.deepEqual(buildMonthCurve(daily, "2026-12", new Date(2026, 10, 6)).cumulative, []);
});

test("scenarioTotals combines efforts and goalImpact measures the months gained", () => {
  const { scenarioTotals, goalImpact } = load("src/shared/utils/scenario.ts");
  const t = scenarioTotals([{ reference: 100000, percent: 20 }, { reference: 60000, percent: 30 }, { reference: 50000, percent: 0 }], 500000, 400000);
  assert.equal(t.monthly, 38000);
  assert.equal(t.annual, 456000);
  assert.equal(t.efforts, 2);
  assert.ok(Math.abs(t.rate - 0.276) < 1e-9);
  assert.equal(scenarioTotals([], 0, 0).rate, null);
  assert.deepEqual(goalImpact({ current: 100, target: 1300, monthlyPace: 100, extra: 50 }), { kind: "sooner", months: 8, gained: 4 });
  assert.deepEqual(goalImpact({ current: 0, target: 1000, monthlyPace: 0, extra: 300 }), { kind: "possible", months: 4 });
  assert.deepEqual(goalImpact({ current: 1000, target: 1000, monthlyPace: 0, extra: 300 }), { kind: "reached" });
});
