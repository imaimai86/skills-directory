import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  discoverClaudeAccountSkills,
  importClaudeAccountSkill,
  linkClaudeAccountSkill
} from '../lib/claude-account.js';

test('discoverClaudeAccountSkills recursively finds skills and ignores staging/buckets', async () => {
  const tmpClaude = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-account-test-'));
  try {
    const syncedDir = path.join(tmpClaude, 'synced');
    const orgDir = path.join(syncedDir, 'org123_user456');

    // Create a valid skill
    const skillA = path.join(orgDir, 'tailor-cv-for-job');
    await fs.mkdir(skillA, { recursive: true });
    await fs.writeFile(
      path.join(skillA, 'SKILL.md'),
      '---\nname: tailor-cv-for-job\ndescription: Tailor CV for job posting\n---\n# CV Tailor'
    );

    // Create a second valid skill
    const skillB = path.join(orgDir, 'docx');
    await fs.mkdir(skillB, { recursive: true });
    await fs.writeFile(
      path.join(skillB, 'SKILL.md'),
      '---\nname: docx\ndescription: Word Document processing\n---\n# Docx'
    );

    // Create a staging directory (should be skipped)
    const stagingDir = path.join(orgDir, '.staging', 'temp-skill');
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(path.join(stagingDir, 'SKILL.md'), '# Temp');

    // Create a .bucket directory (should be skipped)
    const bucketDir = path.join(syncedDir, '.bucket-temp', 'ignored-skill');
    await fs.mkdir(bucketDir, { recursive: true });
    await fs.writeFile(path.join(bucketDir, 'SKILL.md'), '# Ignored');

    const discovered = await discoverClaudeAccountSkills({ claudePath: tmpClaude });
    assert.equal(discovered.length, 2);
    assert.equal(discovered[0].skillId, 'docx');
    assert.equal(discovered[1].skillId, 'tailor-cv-for-job');
    assert.equal(discovered[1].description, 'Tailor CV for job posting');

    // Test filter by skillId
    const filtered = await discoverClaudeAccountSkills({ claudePath: tmpClaude, skillId: 'tailor-cv-for-job' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].skillId, 'tailor-cv-for-job');
  } finally {
    await fs.rm(tmpClaude, { recursive: true, force: true });
  }
});

test('importClaudeAccountSkill copies into repo and never overwrites existing central copy', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'account-import-test-'));
  try {
    const repoSkills = path.join(tmpRoot, 'skills');
    await fs.mkdir(repoSkills, { recursive: true });

    const sourceSkillDir = path.join(tmpRoot, 'source-skill');
    await fs.mkdir(sourceSkillDir, { recursive: true });
    await fs.writeFile(path.join(sourceSkillDir, 'SKILL.md'), '# Original Source');

    const skillObj = {
      skillId: 'my-account-skill',
      skillPath: sourceSkillDir
    };

    // 1. Dry run
    const dryRes = await importClaudeAccountSkill(skillObj, tmpRoot, { dryRun: true });
    assert.equal(dryRes.status, 'imported');
    assert.equal(dryRes.dryRun, true);
    let exists = true;
    try {
      await fs.access(path.join(repoSkills, 'my-account-skill'));
    } catch {
      exists = false;
    }
    assert.equal(exists, false, 'Should not copy in dry-run');

    // 2. Real import
    const realRes = await importClaudeAccountSkill(skillObj, tmpRoot, { dryRun: false });
    assert.equal(realRes.status, 'imported');
    const content = await fs.readFile(path.join(repoSkills, 'my-account-skill', 'SKILL.md'), 'utf-8');
    assert.equal(content, '# Original Source');

    // 3. Second run should skip and NOT overwrite even if source changed
    await fs.writeFile(path.join(sourceSkillDir, 'SKILL.md'), '# Mutated Source');
    const secondRes = await importClaudeAccountSkill(skillObj, tmpRoot, { dryRun: false });
    assert.equal(secondRes.status, 'skipped');
    assert.equal(secondRes.reason, 'already central');

    // Verify repo content remains untouched
    const preservedContent = await fs.readFile(path.join(repoSkills, 'my-account-skill', 'SKILL.md'), 'utf-8');
    assert.equal(preservedContent, '# Original Source');
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('linkClaudeAccountSkill creates atomic symlinks, backs up directories, and checks clash', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'account-link-test-'));
  try {
    const claudeDir = path.join(tmpRoot, 'claude-skills');
    const agyDir = path.join(tmpRoot, 'agy-skills');
    const centralSkill = path.join(tmpRoot, 'central', 'skills', 'tailor-cv-for-job');
    await fs.mkdir(centralSkill, { recursive: true });
    await fs.writeFile(path.join(centralSkill, 'SKILL.md'), '# Tailor CV Central');

    // Setup mock synced folder to trigger clash detection
    const syncedSkill = path.join(claudeDir, 'synced', 'org_1', 'tailor-cv-for-job');
    await fs.mkdir(syncedSkill, { recursive: true });
    await fs.writeFile(path.join(syncedSkill, 'SKILL.md'), '# Synced CV');

    // Pre-create an existing physical directory in agyDir to test .bak backup
    const agyExisting = path.join(agyDir, 'tailor-cv-for-job');
    await fs.mkdir(agyExisting, { recursive: true });
    await fs.writeFile(path.join(agyExisting, 'old.txt'), 'old data');

    const mockAgents = {
      claude: { id: 'claude', name: 'Claude Code', path: claudeDir },
      agy: { id: 'agy', name: 'AGY', path: agyDir }
    };

    const linkResults = await linkClaudeAccountSkill('tailor-cv-for-job', centralSkill, ['claude', 'agy'], {
      claudePath: claudeDir,
      allAgents: mockAgents,
      dryRun: false
    });

    assert.equal(linkResults.length, 2);

    // Claude link check
    const claudeRes = linkResults.find(r => r.agentKey === 'claude');
    assert.ok(claudeRes);
    assert.equal(claudeRes.status, 'linked');
    assert.equal(claudeRes.hasClash, true, 'Should detect clash with account synced skill');

    // Verify claude link target
    const claudeDest = path.join(claudeDir, 'tailor-cv-for-job');
    const claudeStat = await fs.lstat(claudeDest);
    assert.equal(claudeStat.isSymbolicLink(), true);
    assert.equal(await fs.realpath(claudeDest), await fs.realpath(centralSkill));

    // AGY link check: replaced-dir with backup
    const agyRes = linkResults.find(r => r.agentKey === 'agy');
    assert.ok(agyRes);
    assert.equal(agyRes.status, 'replaced-dir');
    assert.ok(agyRes.backupPath.includes('.bak-'));

    // Verify backup exists and contains old.txt
    const backupContent = await fs.readFile(path.join(agyRes.backupPath, 'old.txt'), 'utf-8');
    assert.equal(backupContent, 'old data');

    // Verify agy now points to centralSkill
    const agyDest = path.join(agyDir, 'tailor-cv-for-job');
    const agyStat = await fs.lstat(agyDest);
    assert.equal(agyStat.isSymbolicLink(), true);
    assert.equal(await fs.realpath(agyDest), await fs.realpath(centralSkill));

    // 2. Second run should be idempotent
    const secondLinkRes = await linkClaudeAccountSkill('tailor-cv-for-job', centralSkill, ['claude', 'agy'], {
      claudePath: claudeDir,
      allAgents: mockAgents,
      dryRun: false
    });

    for (const r of secondLinkRes) {
      assert.equal(r.status, 'already-linked');
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
