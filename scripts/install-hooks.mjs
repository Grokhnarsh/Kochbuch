#!/usr/bin/env node
/**
 * Verankert die Hooks aus .githooks/ im Arbeitsverzeichnis.
 *
 * Läuft automatisch nach "npm install" über das prepare-Skript. Hooks
 * liegen im Repository statt in .git/hooks, damit alle dieselben haben;
 * git findet sie über core.hooksPath.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.githooks';

// In einem Tarball-Install oder ohne Git gibt es nichts zu tun.
if (!existsSync('.git') || !existsSync(DIR)) process.exit(0);

try {
  execFileSync('git', ['config', 'core.hooksPath', DIR], { stdio: 'ignore' });

  // Ausführbar-Bit geht über manche Übertragungswege verloren.
  for (const file of readdirSync(DIR)) chmodSync(join(DIR, file), 0o755);

  console.log(`Git-Hooks aktiv aus ${DIR}/`);
} catch {
  // Kein Grund, eine Installation daran scheitern zu lassen.
}
