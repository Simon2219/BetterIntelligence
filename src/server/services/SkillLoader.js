/**
 * SkillLoader - Load skills from filesystem (bundled, workspace, installed)
 * Precedence: workspace > installed > bundled
 */
const fs = require('fs');
const path = require('path');
const Config = require('../../../config/Config');

const SKILL_FILE = 'SKILL.md';

function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) return { metadata: {}, instructions: content };
    const meta = {};
    for (const line of match[1].split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx > 0) {
            const k = line.substring(0, idx).trim();
            const v = line.substring(idx + 1).trim();
            meta[k] = v;
        }
    }
    if (meta.metadata) {
        try { meta.metadata = JSON.parse(meta.metadata); } catch { meta.metadata = {}; }
    }
    return { metadata: meta, instructions: match[2].trim() };
}

function loadSkillFromDir(dirPath) {
    const skillPath = path.join(dirPath, SKILL_FILE);
    if (!fs.existsSync(skillPath)) return null;
    const content = fs.readFileSync(skillPath, 'utf8');
    const { metadata, instructions } = parseFrontmatter(content);
    return {
        name: metadata.name || path.basename(dirPath),
        description: metadata.description || '',
        version: metadata.version || '1.0.0',
        instructions,
        metadata: metadata.metadata || {}
    };
}

function listSkillsForUser(userId) {
    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const skills = new Map();

    const scanDir = (dir, source) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            const skillPath = path.join(dir, e.name);
            const skill = loadSkillFromDir(skillPath);
            if (skill && !skills.has(skill.name)) skills.set(skill.name, { ...skill, slug: e.name, source });
        }
    };

    scanDir(path.join(base, 'bundled'), 'bundled');
    if (userId) {
        scanDir(path.join(base, 'installed', userId), 'installed');
        scanDir(path.join(base, 'workspace', userId), 'workspace');
    }
    return Array.from(skills.values());
}

function getSkillPath(userId, slug) {
    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const workspacePath = path.join(base, 'workspace', userId, slug);
    const installedPath = path.join(base, 'installed', userId, slug);
    const bundledPath = path.join(base, 'bundled', slug);
    if (userId && fs.existsSync(path.join(workspacePath, SKILL_FILE))) return workspacePath;
    if (userId && fs.existsSync(path.join(installedPath, SKILL_FILE))) return installedPath;
    if (fs.existsSync(path.join(bundledPath, SKILL_FILE))) return bundledPath;
    return null;
}

function getSkillsForContext(userId) {
    const skills = listSkillsForUser(userId);
    return skills.map(s => `## ${s.name}\n${s.description}\n\n${s.instructions}`).join('\n\n---\n\n');
}

module.exports = { listSkillsForUser, getSkillPath, loadSkillFromDir, getSkillsForContext, parseFrontmatter };
