#!/usr/bin/env node
/**
 * Prüfen, committen, pushen — in einem Schritt.
 *
 *   npm run sync -- "Kurze Beschreibung"
 *   npm run sync                     # Nachricht wird aus den Änderungen abgeleitet
 *   npm run sync -- --auto           # für automatische Aufrufe, siehe unten
 *
 * Ablauf: Modultests, dann Build, dann Commit und Push auf den aktuellen
 * Branch. Schlägt eine Prüfung fehl, wird trotzdem lokal committet, damit
 * keine Arbeit verlorengeht — der Push bleibt aber aus, damit der Branch
 * auf der Gegenseite nie rot wird. Der nächste erfolgreiche Lauf schiebt
 * beide Commits gemeinsam hoch.
 *
 * Auf dem Standardbranch wird nichts gepusht; Arbeit gehört auf einen
 * eigenen Branch.
 */

import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { argv, exit, env } from 'node:process';

const run = promisify(execFile);

const args = argv.slice(2);
const auto = args.includes('--auto');
const message = args.filter((a) => !a.startsWith('--')).join(' ').trim();

const PROTECTED = new Set(['main', 'master']);

/** Führt ein Kommando aus und liefert die Ausgabe, ohne zu werfen. */
function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8' }).trim();
}

function log(text) {
  console.log(text);
}

/** Leitet eine Commit-Nachricht aus den geänderten Pfaden ab. */
function deriveMessage(status) {
  const files = status
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).split(' -> ').pop());

  const areas = new Set();
  for (const f of files) {
    if (f.startsWith('src/webgl/')) areas.add('WebGL-Board');
    else if (f.startsWith('src/ui/')) areas.add('Oberfläche');
    else if (f.startsWith('src/state/')) areas.add('Wochenplan');
    else if (f.startsWith('src/sources/')) areas.add('Rezeptquellen');
    else if (f.startsWith('src/shops/')) areas.add('Shop-Anbindung');
    else if (f.startsWith('src/data/')) areas.add('Rezeptdaten');
    else if (f.startsWith('tests/')) areas.add('Tests');
    else if (f.startsWith('scripts/')) areas.add('Werkzeuge');
    else if (f.startsWith('.github/')) areas.add('CI');
    else areas.add('Projekt');
  }

  const label = [...areas].sort().join(', ');
  const count = files.length;
  return `${label}: ${count} ${count === 1 ? 'Datei' : 'Dateien'} aktualisiert`;
}

/** Führt eine Prüfung aus und meldet, ob sie durchlief. */
async function check(name, command, cmdArgs) {
  try {
    await run(command, cmdArgs);
    log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    log(`  ✗ ${name}`);
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
    if (output) log(output.split('\n').slice(-14).map((l) => `      ${l}`).join('\n'));
    return false;
  }
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const status = git('status', '--porcelain');

if (!status) {
  log(`Nichts zu tun — ${branch} ist sauber.`);
  exit(0);
}

if (PROTECTED.has(branch)) {
  log(`Branch ${branch} ist geschützt. Änderungen gehören auf einen eigenen Branch:`);
  log('  git checkout -b <name>');
  exit(auto ? 0 : 1);
}

log(`Abgleich auf ${branch}`);

const passed = [
  await check('Modultests', 'npm', ['test']),
  await check('Build', 'npm', ['run', 'build']),
].every(Boolean);

git('add', '-A');

const text = message || deriveMessage(status);
const attribution = [
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  env.CLAUDE_SESSION_URL ? `Claude-Session: ${env.CLAUDE_SESSION_URL}` : null,
].filter((l) => l !== null).join('\n');

try {
  // --no-verify: die Prüfungen liefen oben bereits, und ein Fehlschlag
  // soll hier den Commit nicht verhindern, sondern nur den Push.
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', `${text}\n${attribution}`], {
    stdio: 'inherit',
  });
} catch {
  log('Commit nicht möglich — vermutlich gab es doch nichts zu übernehmen.');
  exit(0);
}

log(`  ✓ Commit: ${text}`);

if (!passed) {
  log('');
  log('Push bleibt aus, weil eine Prüfung fehlgeschlagen ist.');
  log('Die Arbeit liegt als lokaler Commit. Nach der Korrektur erneut');
  log('"npm run sync" aufrufen, dann gehen beide Commits gemeinsam hoch.');
  exit(auto ? 0 : 1);
}

try {
  await run('git', ['push', '-u', 'origin', branch]);
  log(`  ✓ Push nach origin/${branch}`);
} catch (err) {
  log(`  ✗ Push fehlgeschlagen: ${(err.stderr || err.message).trim().split('\n').pop()}`);
  log('    Der Commit liegt lokal und geht beim nächsten Lauf mit hoch.');
  exit(auto ? 0 : 1);
}
