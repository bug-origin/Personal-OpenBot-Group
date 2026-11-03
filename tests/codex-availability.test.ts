import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexAvailability } from '../apps/bridge/src/codex-availability';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture(mode: string) {
  const directory = mkdtempSync(join(tmpdir(), 'openbot-provider-'));
  directories.push(directory);
  const executable = join(directory, 'codex'),
    log = join(directory, 'requests.jsonl');
  writeFileSync(
    executable,
    `#!/usr/bin/env node
const fs=require('fs'),mode=${JSON.stringify(mode)};
if(process.argv.includes('login')){process.exit(1);}
if(mode==='exit'){process.exit(0);}
const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');let pending='';
process.stdin.on('data',c=>{pending+=c;let n;while((n=pending.indexOf('\\n'))>=0){const m=JSON.parse(pending.slice(0,n));pending=pending.slice(n+1);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(m)+'\\n');
if(m.method==='initialize'&&mode!=='stalled')send({id:m.id,result:{}});
if(m.method==='account/read'){
if(mode==='error')send({id:m.id,error:{message:'private-auth-information'}});
else if(mode==='malformed')process.stdout.write('invalid private-auth-information\\n');
else if(mode==='unknown')send({id:m.id,result:{}});
else send({id:m.id,result:{requiresOpenaiAuth:mode!=='custom',account:mode==='logged-in'?{type:'apiKey'}:null}});
}}});setInterval(()=>{},1000);
`,
    { mode: 0o700 },
  );
  return { executable, log };
}

it('accepts a custom provider without OpenAI login and never starts a model turn', async () => {
  const f = fixture('custom');
  expect(await codexAvailability(f.executable, process.env)).toEqual({ available: true });
  const frames = readFileSync(f.log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(frames.map((frame) => frame.method)).toEqual([
    'initialize',
    'initialized',
    'account/read',
  ]);
  expect(frames.at(-1).params.refreshToken).toBe(false);
});

it('accepts an authenticated OpenAI provider and rejects one that actually requires login', async () => {
  expect(await codexAvailability(fixture('logged-in').executable, process.env)).toEqual({
    available: true,
  });
  expect(await codexAvailability(fixture('logged-out').executable, process.env)).toMatchObject({
    available: false,
    reason: expect.stringContaining('需要 OpenAI 登录'),
  });
});

it.each(['error', 'malformed', 'unknown', 'exit', 'stalled'])(
  'reports %s without exposing provider output or treating it as a login failure',
  async (mode) => {
    const result = await codexAvailability(
      fixture(mode).executable,
      process.env,
      mode === 'stalled' ? 200 : 5000,
    );
    expect(result.available).toBe(false);
    expect(result.reason).not.toContain('private-auth-information');
    expect(result.reason).not.toContain('codex login');
  },
);

it('handles an unavailable executable without leaving a pending probe', async () => {
  const f = fixture('custom');
  expect(await codexAvailability(f.executable + '-missing', process.env)).toMatchObject({
    available: false,
    reason: expect.stringContaining('无法启动'),
  });
});
