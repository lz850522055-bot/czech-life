import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function loadConfig(overrides = {}) {
  const configPath = process.env.CZ_CONFIG || path.join(PROJECT_ROOT, 'app/config.local.json');
  const fromFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')) : {};
  const defaults = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'app/config.example.json'), 'utf8'));
  const cfg = { ...defaults, ...fromFile, ...overrides };
  cfg.root = path.resolve(overrides.root || PROJECT_ROOT);
  cfg.port = Number(process.env.CZ_PORT || cfg.port);
  if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535 || [8797, 8890].includes(cfg.port)) throw new Error('端口须在 1024–65535 内，且不得占用 8797 或 8890。');
  if (!['127.0.0.1', '::1', 'localhost'].includes(cfg.host)) throw new Error('服务只允许回环监听。手机请使用独立 HTTPS 转发入口。');
  cfg.publicOrigin = cfg.publicOrigin.replace(/\/$/, '');
  if (cfg.publicOrigin && (new URL(cfg.publicOrigin).protocol !== 'https:' || new URL(cfg.publicOrigin).origin !== cfg.publicOrigin)) throw new Error('publicOrigin 必须是无路径的完整 HTTPS 源。');
  for (const key of ['dataDir', 'uploadsDir', 'backupDir', 'logsDir', 'cacheDir', 'contentDir']) cfg[key] = path.resolve(cfg.root, cfg[key]);
  cfg.dbPath = path.join(cfg.dataDir, 'czech-study.sqlite');
  cfg.publicDir = path.join(PROJECT_ROOT, 'app/public');
  cfg.ai = { ...defaults.ai, ...(fromFile.ai || {}), ...(overrides.ai || {}) };
  cfg.sessionDays = Math.max(1, Math.min(90, Number(cfg.sessionDays) || 14));
  return cfg;
}
export function createDirectories(cfg) {
  for (const key of ['dataDir', 'uploadsDir', 'backupDir', 'logsDir', 'cacheDir']) fs.mkdirSync(cfg[key], { recursive: true, mode: 0o700 });
}
