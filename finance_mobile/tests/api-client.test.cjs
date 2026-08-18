const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadClientModule() {
  const clientPath = path.resolve(__dirname, "../src/shared/api/client.ts");
  const source = fs.readFileSync(clientPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const instance = new Module(clientPath, module);
  instance.filename = clientPath;
  instance.paths = Module._nodeModulePaths(path.dirname(clientPath));
  instance._compile(output, clientPath);
  return instance.exports;
}

const { buildPath } = loadClientModule();

test("buildPath replaces and encodes every FastAPI path parameter", () => {
  assert.equal(
    buildPath("/users/{user_id}/savings-goals/{goal_id}", {
      user_id: "user with spaces",
      goal_id: "goal/1",
    }),
    "/users/user%20with%20spaces/savings-goals/goal%2F1",
  );
});

test("buildPath rejects a missing path parameter", () => {
  assert.throws(
    () => buildPath("/users/{user_id}/expenses/{expense_id}", { user_id: "u1" }),
    /Missing path parameter 'expense_id'/,
  );
});
