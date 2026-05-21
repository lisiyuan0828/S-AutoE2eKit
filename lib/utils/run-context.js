/**
 * Run Context · 测试运行上下文工具（场景无关 · 工厂资产）
 *
 * 用途：
 *   把"当前是哪个分支 / 哪一天 / 哪一次跑"统一收口，让 reporter / playwright config
 *   都从同一处取，避免 N 个文件各自 git rev-parse / new Date()。
 *
 * 设计原则：
 *   - getRunStamp() 必须在 CI / 本地 / detached HEAD / 无 .git 都能 fallback
 *   - 同一个 node 进程内只解析一次（缓存到 module 级 const）
 *   - 任何分支名里非法字符（/ \ : * ? " < > |）一律替换为 -
 *   - 业务无关：projectRoot 默认从 process.cwd() 取（兼容 npm 包模式 / 主仓库直接 require）
 *
 * 输出格式：
 *   YYYYMMDD_<sanitized-branch>     例如：20260518_master / 20260518_feat-e2e
 */

const { execSync } = require('child_process');

/**
 * 取 git 当前分支名；失败返回 'unknown-branch'
 * 优先级：
 *   1. 环境变量（CI 通常会注入）
 *      - CI_COMMIT_REF_NAME (GitLab)
 *      - GITHUB_REF_NAME    (GitHub Actions)
 *      - BUILD_BRANCH       (自定义)
 *      - E2E_BRANCH         (允许用户手动覆盖)
 *   2. git rev-parse --abbrev-ref HEAD
 *   3. 'unknown-branch'
 */
function resolveBranch(projectRoot) {
  const envBranch =
    process.env.E2E_BRANCH ||
    process.env.CI_COMMIT_REF_NAME ||
    process.env.GITHUB_REF_NAME ||
    process.env.BUILD_BRANCH;
  if (envBranch && envBranch.trim()) return envBranch.trim();

  try {
    const out = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    if (out && out !== 'HEAD') return out;
    // detached HEAD：用短 commit hash 兜底
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return sha ? `detached-${sha}` : 'unknown-branch';
  } catch (_e) {
    return 'unknown-branch';
  }
}

function sanitizeBranch(branch) {
  return String(branch || 'unknown-branch')
    .replace(/[\\/\s:*?"<>|]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function todayYYYYMMDD(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

let _cached = null;

/**
 * 获取本次运行的归档命名空间（同进程内幂等）
 *
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] 用于执行 git 的 cwd，默认 process.cwd()
 *                                    （npm 包模式下 __dirname 会指向 node_modules，
 *                                    所以包内不再使用 __dirname 推导）
 * @param {Date}   [opts.now]         注入测试用，默认 new Date()
 * @returns {{ stamp: string, date: string, branch: string, rawBranch: string }}
 */
function getRunStamp(opts = {}) {
  if (_cached && !opts.now && !opts.projectRoot) return _cached;
  const projectRoot = opts.projectRoot || process.cwd();
  const rawBranch = resolveBranch(projectRoot);
  const branch = sanitizeBranch(rawBranch);
  const date = todayYYYYMMDD(opts.now);
  const result = { stamp: `${date}_${branch}`, date, branch, rawBranch };
  if (!opts.now && !opts.projectRoot) _cached = result;
  return result;
}

/**
 * 重置缓存（仅测试用）
 */
function _resetCache() {
  _cached = null;
}

module.exports = {
  getRunStamp,
  sanitizeBranch,
  todayYYYYMMDD,
  _resetCache,
};
