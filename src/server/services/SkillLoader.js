/**
 * SkillLoader - Parse and materialize SKILL.md files.
 * The database is the source of truth; filesystem skill files are cache/runtime artifacts.
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

function getSkillsForContextBySkillIds(skillIds, agentId) {
    const { SkillRepository } = require('../database');
    const blocks = [];
    for (const skillId of skillIds || []) {
        if (!skillId) continue;
        const skill = SkillRepository.getById(skillId);
        if (!skill || !SkillRepository.agentCanUseSkill(agentId, skillId)) continue;
        const definition = skill.definition || skill.definition_json || {};
        const name = definition.name || skill.name || skill.slug;
        const description = definition.description || skill.description || '';
        const instructions = skill.instructions_text || definition.instructions || '';
        if (!instructions && skill.materialized_path) {
            const fullPath = path.isAbsolute(skill.materialized_path)
                ? skill.materialized_path
                : path.join(path.resolve(Config.get('skills.basePath', './data/skills')), skill.materialized_path);
            const loaded = loadSkillFromDir(fullPath);
            if (loaded) {
                blocks.push(`## ${loaded.name}\n${loaded.description}\n\n${loaded.instructions}`);
                continue;
            }
        }
        if (name || description || instructions) {
            blocks.push(`## ${name}\n${description}\n\n${instructions}`.trim());
        }
    }
    return blocks.length ? blocks.join('\n\n---\n\n') : '';
}

function initFilesystem() {
    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const dirs = [
        path.join(base, 'bundled'),
        path.join(base, 'workspace'),
        path.join(base, 'installed')
    ];
    for (const d of dirs) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }

    const bundledSkills = [
        {
            slug: 'greeting',
            name: 'greeting',
            description: 'Friendly greeting and small talk',
            instructions: 'When the user greets you or wants casual conversation, respond warmly and encourage dialogue.'
        },
        {
            slug: 'summarizer',
            name: 'summarizer',
            description: 'Summarize long text',
            instructions: 'When the user asks you to summarize text, provide a concise summary that captures the main points.'
        },
        {
            slug: 'qa',
            name: 'qa',
            description: 'Answer questions from context',
            instructions: 'When the user asks a question, answer based on the context provided. Be concise and accurate.'
        }
    ];

    for (const skill of bundledSkills) {
        const skillPath = path.join(base, 'bundled', skill.slug);
        if (fs.existsSync(skillPath)) continue;
        fs.mkdirSync(skillPath, { recursive: true });
        fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: ${skill.description}\nversion: 1.0.0\n---\n\n${skill.instructions}\n`);
    }
}

module.exports = { loadSkillFromDir, getSkillsForContextBySkillIds, parseFrontmatter, initFilesystem };
