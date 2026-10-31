import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanSkills } from '../lib/scanner.js';
import {
  AGENTS,
  linkSkill,
  unlinkSkill,
  checkSkillConflict,
  getCanonicalSource
} from '../lib/linker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('scanSkills detects all canonical skills with frontmatter', async () => {
  const skills = await scanSkills(path.join(ROOT, 'skills'));
  assert.equal(skills.length, 4, `Expected exactly 4 curated skills, found ${skills.length}`);
  
  const deepen = skills.find(s => s.id === 'deepen');
  assert.ok(deepen, 'deepen skill should exist');
  assert.equal(deepen.name, 'deepen');
  assert.ok(deepen.description.includes('Turn a goal into a deeper'));

  const findContacts = skills.find(s => s.id === 'linkedin-find-contacts');
  assert.ok(findContacts, 'linkedin-find-contacts skill should exist');

  const jobApply = skills.find(s => s.id === 'linkedin-job-apply');
  assert.ok(jobApply, 'linkedin-job-apply skill should exist');

  const sendConnections = skills.find(s => s.id === 'linkedin-send-connections');
  assert.ok(sendConnections, 'linkedin-send-connections skill should exist');
});

test('getCanonicalSource identifies local git repository', async () => {
  const source = await getCanonicalSource(ROOT, false);
  assert.equal(source.type, 'repo');
  assert.equal(source.baseDir, path.join(ROOT, 'skills'));
});

test('linkSkill and unlinkSkill with dry-run produces zero filesystem mutations', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
  try {
    // Override agent path temporarily for testing
    const originalClaudePath = AGENTS.claude.path;
    AGENTS.claude.path = tmpDir;

    const sourceSkill = path.join(ROOT, 'skills', 'deepen');
    const result = await linkSkill('deepen', sourceSkill, 'claude', { dryRun: true });
    
    assert.equal(result.status, 'linked');
    
    // Check that nothing was written in tmpDir
    const files = await fs.readdir(tmpDir);
    assert.equal(files.length, 0);

    AGENTS.claude.path = originalClaudePath;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('linkSkill creates valid symlink and is idempotent', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
  try {
    const originalClaudePath = AGENTS.claude.path;
    AGENTS.claude.path = tmpDir;

    const sourceSkill = path.join(ROOT, 'skills', 'deepen');
    
    // First link
    const res1 = await linkSkill('deepen', sourceSkill, 'claude', { dryRun: false });
    assert.equal(res1.status, 'linked');

    const destLink = path.join(tmpDir, 'deepen');
    const lstat = await fs.lstat(destLink);
    assert.ok(lstat.isSymbolicLink(), 'Target should be a symbolic link');

    const target = await fs.readlink(destLink);
    assert.equal(path.resolve(target), path.resolve(sourceSkill));

    // Verify reading SKILL.md through symlink matches source
    const srcContent = await fs.readFile(path.join(sourceSkill, 'SKILL.md'), 'utf-8');
    const destContent = await fs.readFile(path.join(destLink, 'SKILL.md'), 'utf-8');
    assert.equal(destContent, srcContent);

    // Second link (idempotency check)
    const res2 = await linkSkill('deepen', sourceSkill, 'claude', { dryRun: false });
    assert.equal(res2.status, 'already-linked');

    // Unlink test
    const unres = await unlinkSkill('deepen', 'claude', { dryRun: false });
    assert.equal(unres.status, 'unlinked');

    let exists = true;
    try {
      await fs.lstat(destLink);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, 'Symlink should be removed after unlink');

    AGENTS.claude.path = originalClaudePath;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('linkSkill enforces protected path safeguard', async () => {
  const resClaude = await linkSkill('synced', '/tmp/fake', 'claude');
  assert.equal(resClaude.status, 'skipped');
  assert.equal(resClaude.reason, 'protected path');

  const resCodex = await linkSkill('.system', '/tmp/fake', 'codex');
  assert.equal(resCodex.status, 'skipped');
  assert.equal(resCodex.reason, 'protected path');
});

test('checkSkillConflict and conditional replacement with backup', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-conflict-test-'));
  try {
    const originalClaudePath = AGENTS.claude.path;
    AGENTS.claude.path = tmpDir;

    const sourceSkill = path.join(ROOT, 'skills', 'deepen');
    const existingSkillDir = path.join(tmpDir, 'deepen');

    // Create a pre-existing physical directory
    await fs.mkdir(existingSkillDir);
    await fs.writeFile(path.join(existingSkillDir, 'SKILL.md'), 'pre-existing custom content');

    // Conflict check should detect directory
    const conflict = await checkSkillConflict('deepen', sourceSkill, 'claude');
    assert.equal(conflict.hasConflict, true);
    assert.equal(conflict.type, 'directory');

    // Linking with replace: false should skip and preserve content
    const skipRes = await linkSkill('deepen', sourceSkill, 'claude', { replace: false });
    assert.equal(skipRes.status, 'skipped');
    const preservedContent = await fs.readFile(path.join(existingSkillDir, 'SKILL.md'), 'utf-8');
    assert.equal(preservedContent, 'pre-existing custom content');

    // Linking with replace: true should back up and create symlink
    const replaceRes = await linkSkill('deepen', sourceSkill, 'claude', { replace: true });
    assert.equal(replaceRes.status, 'replaced-dir');
    assert.ok(replaceRes.backupPath);

    // Verify backup file exists with original content
    const backupContent = await fs.readFile(path.join(replaceRes.backupPath, 'SKILL.md'), 'utf-8');
    assert.equal(backupContent, 'pre-existing custom content');

    // Verify destination is now a symlink pointing to sourceSkill
    const lstat = await fs.lstat(existingSkillDir);
    assert.ok(lstat.isSymbolicLink());
    const target = await fs.readlink(existingSkillDir);
    assert.equal(path.resolve(target), path.resolve(sourceSkill));

    // Conflict check now reports alreadyLinked
    const conflictAfter = await checkSkillConflict('deepen', sourceSkill, 'claude');
    assert.equal(conflictAfter.hasConflict, false);
    assert.equal(conflictAfter.alreadyLinked, true);

    AGENTS.claude.path = originalClaudePath;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
