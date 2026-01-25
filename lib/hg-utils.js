const { execSync } = require('../src/lib/safe-exec');
const path = require('path');
const fs = require('fs');

/**
 * Check if a directory is a Mercurial repository.
 * @param {string} [directory=process.cwd()] - Directory to check
 * @returns {boolean} True if it's a Mercurial repository
 */
function isHgRepo(directory = process.cwd()) {
  try {
    // A more reliable way is to check for the .hg directory
    // as `hg root` can be slow.
    let currentDir = directory;
    while (currentDir) {
      if (fs.existsSync(path.join(currentDir, '.hg'))) {
        return true;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get the root directory of the Mercurial repository.
 * @param {string} [directory=process.cwd()] - Directory within the repository
 * @returns {string|null} The root directory of the repo or null
 */
function getHgRepoRoot(directory = process.cwd()) {
  try {
    return execSync('hg root', {
      cwd: directory,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get the current branch of the Mercurial repository.
 * @param {string} [directory=process.cwd()] - Directory within the repository
 * @returns {string|null} The current branch name or null
 */
function getHgBranch(directory = process.cwd()) {
  try {
    return execSync('hg branch', {
      cwd: directory,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get the worktree paths of the Mercurial repository.
 * For Mercurial, this will typically just be the repo root.
 * @param {string} [directory=process.cwd()] - Directory within the repository
 * @returns {string[]|null} An array of worktree paths or null
 */
function getHgWorktreePaths(directory = process.cwd()) {
  const root = getHgRepoRoot(directory);
  return root ? [root] : null;
}

module.exports = {
  isHgRepo,
  getHgRepoRoot,
  getHgBranch,
  getHgWorktreePaths,
};
