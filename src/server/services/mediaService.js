/**
 * Media Service - Save AI-generated and user-uploaded media to disk
 */
const path = require('path');
const Config = require('../../../config/Config');
const FileStorageService = require('./FileStorageService');

const storage = new FileStorageService(Config.get('media.path', './data/media'));

function getExtension(mimeType) {
    if (!mimeType) return '.jpg';
    const m = String(mimeType).toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('png')) return '.png';
    if (m.includes('mp4') || m === 'video/mp4') return '.mp4';
    if (m.includes('webm') || m === 'video/webm') return '.webm';
    return '.jpg';
}

function saveMedia(buffer, options = {}) {
    const { conversationId, userId, chatId, mimeType } = options;
    const ext = getExtension(mimeType);
    let prefix;
    if (userId && chatId) {
        prefix = `chat_${String(userId).replace(/[^a-z0-9_-]/gi, '_')}_${String(chatId).replace(/[^a-z0-9_-]/gi, '_')}_`;
    } else if (userId) {
        prefix = `avatar_${userId}_`;
    } else {
        prefix = `ai_${conversationId || 'temp'}_`;
    }
    const filename = `${prefix}${Date.now()}${ext}`;
    storage.write(filename, buffer);
    return {
        filename,
        url: '/media/' + filename
    };
}

function saveBase64(base64Data, options = {}) {
    const base64Clean = String(base64Data).replace(/^data:[\w/+-]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    return saveMedia(buffer, options);
}

function getFilePath(filename) {
    return path.join(storage.getBasePath(), filename);
}

function exists(filename) {
    return storage.exists(filename);
}

function getBasePath() {
    return storage.getBasePath();
}

module.exports = { saveMedia, saveBase64, getFilePath, exists, getBasePath };
