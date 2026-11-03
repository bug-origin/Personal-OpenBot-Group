// Inspect files Git would publish. Report locations only, never secret values.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
];
const problems = [];
const forbidden =
  /(?:^|\/)(?:\.data|node_modules|target|dist|test-results|playwright-report|coverage)(?:\/|$)|(?:^|\/)(?:\.env(?:\..+)?|config\.env|model-settings\.json(?:\..*)?)$|\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$|\.(?:pem|key|p12|pfx|log)$/i;
const checks = [
  ['local home path', /(?:\/Users\/|\/home\/)[^\s"'<>`]+|[A-Z]:\\Users\\[^\s"'<>`]+/],
  [
    'API key',
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/,
  ],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['credential in URL', /https?:\/\/[^\s/:@]+:[^\s/@]+@/],
];
for (const name of files) {
  if (forbidden.test(name) && !/(?:^|\/)\.env\.example$/.test(name)) {
    problems.push(`${name}: local data or generated output must not be published`);
    continue;
  }
  const filename = resolve(root, name);
  let stat;
  try {
    stat = lstatSync(filename);
  } catch (error) {
    if (error.code === 'ENOENT') continue; // A staged deletion is safe.
    throw error;
  }
  if (stat.isSymbolicLink()) {
    problems.push(`${name}: review symlink before publishing`);
    continue;
  }
  if (!stat.isFile()) continue;
  if (stat.size > 5 * 1024 * 1024) {
    problems.push(`${name}: file larger than 5 MiB needs review`);
    continue;
  }
  const content = readFileSync(filename);
  if (content.includes(0)) continue;
  for (const [i, line] of content.toString('utf8').split(/\r?\n/).entries())
    for (const [label, pattern] of checks)
      if (pattern.test(line)) problems.push(`${name}:${i + 1}: ${label}`);
}
for (const required of ['LICENSE', 'README.md', '.env.example', 'THIRD_PARTY_NOTICES.md'])
  if (!files.includes(required)) problems.push(`${required}: missing from source files`);
if (problems.length) {
  console.error('Release check failed:\n' + problems.map((p) => `- ${p}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Release check passed: ${files.length} source files; no detected credentials, local data, home paths or build output.`,
  );
}
