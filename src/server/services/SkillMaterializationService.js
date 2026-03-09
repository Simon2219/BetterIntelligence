const fs = require('fs');
const path = require('path');
const Config = require('../../../config/Config');

function escapeFrontmatter(value) {
    return String(value || '').replace(/\r?\n/g, ' ').trim();
}

function buildSkillMarkdown(skill = {}) {
    const definition = skill.definition_json || skill.definition || {};
    const metadata = skill.metadata_json || skill.metadata || definition.metadata || {};
    const name = skill.name || definition.name || skill.slug || 'Skill';
    const description = skill.description || definition.description || '';
    const version = skill.version || definition.version || '1.0.0';
    const instructions = skill.instructions_text || definition.instructions || '';
    return `---
name: ${escapeFrontmatter(name)}
description: ${escapeFrontmatter(description)}
version: ${escapeFrontmatter(version)}
metadata: ${JSON.stringify(metadata || {})}
---

${String(instructions || '').trim()}
`;
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function materializeSkillToPath(skill, targetDir) {
    ensureDir(targetDir);
    const skillFile = path.join(targetDir, 'SKILL.md');
    fs.writeFileSync(skillFile, buildSkillMarkdown(skill), 'utf8');
    return skillFile;
}

function getSkillsBasePath() {
    return path.resolve(Config.get('skills.basePath', './data/skills'));
}

function getWorkspaceSkillDir(skill, userId) {
    return path.join(getSkillsBasePath(), 'workspace', userId, skill.slug);
}

function getInstalledSkillDir(userId, slug) {
    return path.join(getSkillsBasePath(), 'installed', userId, slug);
}

module.exports = {
    buildSkillMarkdown,
    materializeSkillToPath,
    getSkillsBasePath,
    getWorkspaceSkillDir,
    getInstalledSkillDir
};
