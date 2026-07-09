/**
 * Voice lint. Scans every source file and copy config for the banned
 * patterns: em-dashes anywhere, plus the negate-then-correct sentence
 * shapes the copy rules prohibit. Fails with file:line so violations are
 * one click away. Patterns are built from escapes so this file cannot
 * trip itself.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
    path.resolve(__dirname, '../src'),
    path.resolve(__dirname, '.'),
    path.resolve(__dirname, '../index.html'),
    path.resolve(__dirname, '../README.md'),
    path.resolve(__dirname, '../../README.md'),
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.json', '.html', '.md', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'generated', 'dist']);

const RULES = [
    { name: 'em-dash', re: new RegExp('\\u2014', 'g') },
    { name: 'not-just-but', re: new RegExp('not\\x20just\\b[\\s\\S]{0,80}?\\bbut\\b', 'gi') },
    { name: 'nt-just', re: new RegExp("n't\\x20just\\b", 'gi') },
];

function* walk(target) {
    const stat = fs.statSync(target, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isFile()) {
        if (EXTENSIONS.has(path.extname(target))) yield target;
        return;
    }
    for (const entry of fs.readdirSync(target)) {
        if (SKIP_DIRS.has(entry)) continue;
        yield* walk(path.join(target, entry));
    }
}

const violations = [];
for (const root of ROOTS) {
    for (const file of walk(root)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            for (const rule of RULES) {
                rule.re.lastIndex = 0;
                if (rule.re.test(line)) {
                    violations.push(`${path.relative(process.cwd(), file)}:${i + 1} [${rule.name}] ${line.trim().slice(0, 100)}`);
                }
            }
        });
    }
}

if (violations.length > 0) {
    console.error('[check-voice] banned constructions found:');
    for (const v of violations) console.error('  ' + v);
    process.exit(1);
}
console.log('[check-voice] clean: no em-dashes, no negate-then-correct constructions.');
