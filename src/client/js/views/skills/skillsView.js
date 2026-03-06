import { skillCardHtml } from './skillsCardRender.js';
import { renderSkillsListView } from './skillsListView.js';
import { renderSkillsCategoryManagerView } from './skillsCategoryManagerView.js';
import { renderSkillsFormView } from './skillsFormView.js';

export function createSkillsView(deps) {
    const { api, navigate, showToast, escapeHtml } = deps;

    async function renderSkillForm(container, slugOrId) {
        await renderSkillsFormView({
            container,
            slugOrId,
            api,
            navigate,
            showToast,
            escapeHtml
        });
    }

    async function renderSkillsCategoryManager(container, path, categories) {
        await renderSkillsCategoryManagerView({
            container,
            path,
            categories,
            api,
            showToast,
            escapeHtml,
            rerender: (nextPath) => renderSkills(container, nextPath)
        });
    }

    async function renderSkills(container, path) {
        const parts = path.split('/').filter(Boolean);
        const isNew = parts[1] === 'new';
        const editSlug = parts[1] && parts[1] !== 'new' ? parts[1] : null;

        if (isNew || editSlug) {
            await renderSkillForm(container, editSlug);
            return;
        }

        await renderSkillsListView({
            container,
            path,
            api,
            navigate,
            showToast,
            escapeHtml,
            skillCardHtml,
            openCategoryManager: (categories) => renderSkillsCategoryManager(container, path, categories),
            rerender: (nextPath) => renderSkills(container, nextPath)
        });
    }

    return {
        skillCardHtml: (skill, showActions = false, categories = []) => skillCardHtml(skill, escapeHtml, showActions, categories),
        renderSkills,
        renderSkillsCategoryManager,
        renderSkillForm
    };
}
