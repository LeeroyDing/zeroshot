const git = require('./git-utils');
const hg = require('./hg-utils');

/**
 * Get the version control system for a directory.
 * @param {string} [directory=process.cwd()] - The directory to check.
 * @returns {'git'|'hg'|null} The VCS name or null if not a repo.
 */
function getVCS(directory = process.cwd()) {
  if (git.isGitRepo(directory)) {
    return 'git';
  }
  if (hg.isHgRepo(directory)) {
    return 'hg';
  }
  return null;
}

/**
 * Get the root directory of the repository.
 * @param {string} [directory=process.cwd()] - Directory within the repository
 * @returns {string|null} The root directory of the repo or null
 */
function getRepoRoot(directory = process.cwd()) {
  const vcs = getVCS(directory);
  if (vcs === 'git') {
    return git.getRepoRoot(directory);
  }
  if (vcs === 'hg') {
    return hg.getHgRepoRoot(directory);
  }
  return null;
}

/**
 * Get the current branch of the repository.
 * @param {string} [directory=process.cwd()] - Directory within the repository
 * @returns {string|null} The current branch name or null
 */
function getBranch(directory = process.cwd()) {
  const vcs = getVCS(directory);
  if (vcs === 'git') {
    return git.getBranch(directory);
  }
  if (vcs === 'hg') {
    return hg.getBranch(directory);
  }
  return null;
}

/**
 * Get the worktree paths of the repository.
 * @param {string} [directory=process.cwd()] - Directory within the repository
 * @returns {string[]|null} An array of worktree paths or null
 */
function getWorktreePaths(directory = process.cwd()) {
  const vcs = getVCS(directory);
  if (vcs === 'git') {
    return git.getWorktreePaths(directory);
  }
  if (vcs === 'hg') {
    return hg.getWorktreePaths(directory);
  }
  return null;
}

module.exports = {
  getVCS,
  getRepoRoot,
  getBranch,
  getWorktreePaths,
};
