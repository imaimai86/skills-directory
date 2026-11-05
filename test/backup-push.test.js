import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  resolveSource,
  discoverAgentSkills,
  findSkill,
  backupSkill,
  importSkillToRepo,
  relinkAgentSkill,
  commitAndPushSkill,
  backupAndPushSkill,
  KNOWN_AGENTS
} from '../lib/backup-push.js';

const execFileAsync = promisify(execFile);

test('resolveSource accurately identifies known agents and custom paths', () => {
  const claude = resolveSource('claude');
  assert.equal(claude.id, 'claude');
  assert.equal(claude.isAgent, true);

  const agy = resolveSource('agy');
  assert.equal(agy.id, 'agy');

  const antigravity = resolveSource('antigravity');
  assert.equal(antigravity.id, 'agy');

  const codex = resolveSource('codex');
  assert.equal(codex.id, 'codex');

  const cursor = resolveSource('cursor');
  assert.equal(cursor.id, 'cursor');

  // Custom path
  const custom = resolveSource('/tmp/my-custom-skills');
  assert.equal(custom.path, '/tmp/my-custom-skills');
  assert.equal(custom.isAgent, false);

  // Name=path syntax
  const named = resolveSource('opencode=/opt/opencode/skills');
  assert.equal(named.id, 'opencode');
  assert.equal(named.path, '/opt/opencode/skills');
  assert.equal(named.isAgent, true);
});

test('backupSkill creates timestamped backup and respects dry-run', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
  try {
    const sourceSkill = path.join(tmpDir, 'source-skill');
    await fs.mkdir(sourceSkill, { recursive: true });
    await fs.writeFile(path.join(sourceSkill, 'SKILL.md'), '# Test Skill');
    await fs.writeFile(path.join(sourceSkill, '.DS_Store'), 'junk');

    const backupRoot = path.join(tmpDir, 'backups');

    // Test dry-run
    const dryRes = await backupSkill(sourceSkill, 'source-skill', 'claude', {
      backupRoot,
      dryRun: true
    });
    assert.equal(dryRes.status, 'dry-run');
    let exists = true;
    try {
      await fs.access(backupRoot);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, 'Backup dir should not be created in dry run');

    // Test real backup
    const realRes = await backupSkill(sourceSkill, 'source-skill', 'claude', {
      backupRoot,
      dryRun: false
    });
    assert.equal(realRes.status, 'backed-up');
    const backedUpSkillMd = await fs.readFile(path.join(realRes.backupDir, 'SKILL.md'), 'utf-8');
    assert.equal(backedUpSkillMd, '# Test Skill');

    // Verify .DS_Store was filtered out
    let dsStoreExists = true;
    try {
      await fs.access(path.join(realRes.backupDir, '.DS_Store'));
    } catch {
      dsStoreExists = false;
    }
    assert.equal(dsStoreExists, false, '.DS_Store should be filtered during backup');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('importSkillToRepo copies skill into repo and ensures SKILL.md exists', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-test-'));
  try {
    const sourceSkill = path.join(tmpDir, 'agent-skills', 'custom-helper');
    await fs.mkdir(sourceSkill, { recursive: true });
    await fs.writeFile(path.join(sourceSkill, 'helper.js'), 'console.log("hi");');

    const mockRepoRoot = path.join(tmpDir, 'repo');
    await fs.mkdir(mockRepoRoot, { recursive: true });

    const res = await importSkillToRepo(sourceSkill, 'custom-helper', mockRepoRoot, {
      agentName: 'Codex'
    });
    assert.equal(res.status, 'imported');

    // Verify file copied
    const helperContent = await fs.readFile(path.join(mockRepoRoot, 'skills', 'custom-helper', 'helper.js'), 'utf-8');
    assert.equal(helperContent, 'console.log("hi");');

    // Verify auto-generated SKILL.md
    const skillMdContent = await fs.readFile(path.join(mockRepoRoot, 'skills', 'custom-helper', 'SKILL.md'), 'utf-8');
    assert.ok(skillMdContent.includes('name: custom-helper'));
    assert.ok(skillMdContent.includes('Skill imported from Codex'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('relinkAgentSkill replaces agent directory with symlink to repo target', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'relink-test-'));
  try {
    const agentSkillDir = path.join(tmpDir, 'claude', 'my-skill');
    await fs.mkdir(agentSkillDir, { recursive: true });
    await fs.writeFile(path.join(agentSkillDir, 'SKILL.md'), '# Original');

    const repoTargetDir = path.join(tmpDir, 'repo', 'skills', 'my-skill');
    await fs.mkdir(repoTargetDir, { recursive: true });
    await fs.writeFile(path.join(repoTargetDir, 'SKILL.md'), '# Repo Target');

    const res = await relinkAgentSkill(agentSkillDir, repoTargetDir, { dryRun: false, symlink: true });
    assert.equal(res.status, 'relinked');

    const lstat = await fs.lstat(agentSkillDir);
    assert.ok(lstat.isSymbolicLink(), 'Agent skill path should now be a symlink');

    const readBack = await fs.readFile(path.join(agentSkillDir, 'SKILL.md'), 'utf-8');
    assert.equal(readBack, '# Repo Target', 'Agent path should now read content from repo target');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('commitAndPushSkill stages and commits skill in a git repository', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-test-'));
  try {
    // Initialize mock git repo
    await execFileAsync('git', ['init'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.name', 'Test Agent'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });

    // Initial commit
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Repo');
    await execFileAsync('git', ['add', 'README.md'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

    // Add a new skill
    const skillDir = path.join(tmpDir, 'skills', 'awesome-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Awesome Skill');

    const gitRes = await commitAndPushSkill('awesome-skill', tmpDir, {
      message: 'feat(skills): add awesome-skill',
      noPush: true
    });

    assert.equal(gitRes.status, 'committed');
    assert.equal(gitRes.commitMessage, 'feat(skills): add awesome-skill');
    assert.ok(gitRes.commitHash, 'Commit hash should be returned');

    // Verify git log contains the commit
    const { stdout: log } = await execFileAsync('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir });
    assert.equal(log.trim(), 'feat(skills): add awesome-skill');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('backupAndPushSkill executes full pipeline end-to-end', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-test-'));
  try {
    // 1. Initialize mock repo
    const mockRepo = path.join(tmpDir, 'skills-repo');
    await fs.mkdir(mockRepo, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: mockRepo });
    await execFileAsync('git', ['config', 'user.name', 'Test Agent'], { cwd: mockRepo });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: mockRepo });
    await fs.writeFile(path.join(mockRepo, '.gitignore'), 'node_modules/\n');
    await execFileAsync('git', ['add', '.gitignore'], { cwd: mockRepo });
    await execFileAsync('git', ['commit', '-m', 'chore: init repo'], { cwd: mockRepo });

    // 2. Setup mock agent directory with a physical skill folder
    const mockAgentDir = path.join(tmpDir, 'mock-agent', 'skills');
    const skillPath = path.join(mockAgentDir, 'agent-tool');
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: agent-tool\ndescription: A test tool\n---\n# Agent Tool\n');

    const backupRoot = path.join(tmpDir, 'mock-backups');

    // 3. Execute backupAndPushSkill
    const result = await backupAndPushSkill({
      skillId: 'agent-tool',
      agentId: 'mock-agent',
      agentName: 'Mock Agent',
      skillPath,
      type: 'physical-dir'
    }, {
      repoRoot: mockRepo,
      backupRoot,
      noPush: true,
      message: 'feat: backup and push agent-tool'
    });

    // Check backup
    assert.equal(result.backupRes.status, 'backed-up');
    assert.ok(result.backupRes.backupDir.startsWith(backupRoot));

    // Check repo target
    assert.equal(result.importRes.status, 'imported');
    const importedSkillMd = await fs.readFile(path.join(mockRepo, 'skills', 'agent-tool', 'SKILL.md'), 'utf-8');
    assert.ok(importedSkillMd.includes('name: agent-tool'));

    // Check relink: agent path is now a symlink pointing into the repo
    assert.equal(result.relinkRes.status, 'relinked');
    const lstat = await fs.lstat(skillPath);
    assert.ok(lstat.isSymbolicLink());
    const linkTarget = await fs.readlink(skillPath);
    assert.equal(path.resolve(linkTarget), path.resolve(path.join(mockRepo, 'skills', 'agent-tool')));

    // Check git commit
    assert.equal(result.gitRes.status, 'committed');
    assert.equal(result.gitRes.commitMessage, 'feat: backup and push agent-tool');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
