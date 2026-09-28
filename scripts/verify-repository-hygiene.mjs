import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const forbidden = tracked.filter((file) => {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  if (/^\.env(?:\..*)?$/.test(normalized) && normalized !== '.env.example') return true;
  if (/(^|\/)\.(?:npmrc|pypirc)$/.test(normalized)) return true;
  if (/(^|\/)(?:id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$/.test(normalized)) return true;
  return false;
});

if (forbidden.length) {
  console.error('Forbidden secret or private-key files are tracked:');
  for (const file of forbidden) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Repository hygiene check passed: ${tracked.length} tracked files scanned.`);
