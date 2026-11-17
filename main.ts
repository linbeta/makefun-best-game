// Giltwake — hands the entry in (Node 22+, standard library only).
// Copies game/ and screenshots/ from beside this file to the output directory ($MAKEFUN_OUTPUT_DIR,
// or /output in the grader) and writes dossier.json with the kit's unchanged buildDossier.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Replaces dest with a fresh copy of src, so repeated runs give identical trees. */
function copyFresh(src: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFresh(join(repoRoot, 'game'), join(outputDir, 'game'));
copyFresh(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

// The scorer's caps: text_max_bytes shapes the dossier text; the rest refuse an entry the gate would refuse.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Giltwake handed in to ${outputDir}`);
