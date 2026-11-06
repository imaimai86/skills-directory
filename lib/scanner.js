import fs from 'node:fs/promises';
import path from 'node:path';

export async function parseFrontmatter(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return { description: '' };
    
    const lines = match[1].split('\n');
    const data = {};
    let currentKey = null;
    let currentValue = '';

    const cleanVal = (val) => val.trim().replace(/^["'](.*)["']$/, '$1');

    for (const line of lines) {
      const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (keyMatch) {
        if (currentKey) {
          data[currentKey] = cleanVal(currentValue);
        }
        currentKey = keyMatch[1];
        currentValue = keyMatch[2];
      } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
        currentValue += ' ' + line.trim();
      }
    }
    if (currentKey) {
      data[currentKey] = cleanVal(currentValue);
    }
    return data;
  } catch {
    return { description: '' };
  }
}

export async function scanSkills(skillsDir) {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name);
    const skillMd = path.join(skillPath, 'SKILL.md');
    
    let exists = false;
    try {
      await fs.access(skillMd);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      const metadata = await parseFrontmatter(skillMd);
      skills.push({
        id: entry.name,
        name: metadata.name || entry.name,
        description: metadata.description || 'No description provided',
        argumentHint: metadata['argument-hint'] || '',
        path: skillPath
      });
    }
  }

  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}
