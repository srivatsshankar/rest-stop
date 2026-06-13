const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function run(command, args, options = {}) {
  return childProcess.spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
}

function findRestic() {
  if (process.env.RESTIC_PATH) {
    const result = run(process.env.RESTIC_PATH, ["version"]);
    return result.status === 0 ? process.env.RESTIC_PATH : null;
  }

  const result = run("restic", ["version"]);
  return result.status === 0 ? "restic" : null;
}

function assertCommandSucceeded(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function findFile(root, fileName) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const found = findFile(fullPath, fileName);
      if (found) return found;
    }
  }
  return null;
}

test("restic can create a local backup and restore it", (t) => {
  const restic = findRestic();
  if (!restic) {
    t.skip("restic is not installed. Set RESTIC_PATH or add restic to PATH to run this integration test.");
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reststop-restic-test-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  const sourceDir = path.join(root, "source");
  const nestedDir = path.join(sourceDir, "notes");
  const repoDir = path.join(root, "repository");
  const restoreDir = path.join(root, "restore");
  const cacheDir = path.join(root, "cache");
  const password = "reststop-local-test-password";

  fs.mkdirSync(nestedDir, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(restoreDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "document.txt"), "Rest Stop backup test\n");
  fs.writeFileSync(path.join(nestedDir, "note.txt"), "Rest Stop restore test\n");

  const env = {
    ...process.env,
    RESTIC_CACHE_DIR: cacheDir,
    RESTIC_PASSWORD: password
  };

  assertCommandSucceeded(run(restic, ["-r", repoDir, "init"], { env }), "restic init");
  assertCommandSucceeded(run(restic, ["-r", repoDir, "backup", "."], { cwd: sourceDir, env }), "restic backup");

  const snapshots = run(restic, ["-r", repoDir, "snapshots", "--json"], { env });
  assertCommandSucceeded(snapshots, "restic snapshots");
  assert.ok(JSON.parse(snapshots.stdout).length >= 1, "expected restic to create at least one snapshot");

  assertCommandSucceeded(run(restic, ["-r", repoDir, "restore", "latest", "--target", restoreDir], { env }), "restic restore");

  const restoredDocument = findFile(restoreDir, "document.txt");
  const restoredNote = findFile(restoreDir, "note.txt");
  assert.ok(restoredDocument, "expected document.txt to be restored");
  assert.ok(restoredNote, "expected note.txt to be restored");
  assert.equal(fs.readFileSync(restoredDocument, "utf8"), "Rest Stop backup test\n");
  assert.equal(fs.readFileSync(restoredNote, "utf8"), "Rest Stop restore test\n");
});
