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


const { validateAuthForm, authErrorMessage, sanitizeCode, isCodeComplete } = load("src/shared/utils/authForm.ts");

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
  assert.match(describeTrend({ ...base, trend: 0, history_months: 2 }).label, /Trop tôt/);
  assert.equal(describeTrend({ ...base, trend: 0.2, history_months: null }).label, "↗ En hausse");
  assert.match(describeTrend({ trend: 0.2, drift_score: 0.9, history_months: 6 }).sub, /Dérive/);
  assert.equal(describeTrend(null).label, "—");
});
