const { execSync } = require('../../src/lib/safe-exec');
const path = require('path');
const os = require('os');
const fs = require('fs');

function escapeShell(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function _getGhToken() {
  try {
    const hostsPath = path.join(os.homedir(), '.config', 'gh', 'hosts.yml');
    if (!fs.existsSync(hostsPath)) return null;

    const content = fs.readFileSync(hostsPath, 'utf8');
    // Match oauth_token: <token> in YAML
    const match = content.match(/oauth_token:\s*(\S+)/);
    return match ? match[1] : null;
  } catch (err) {
    if (err) {
      /* ignore */
    }
    return null;
  }
}

/**
 * Parse git remote URL into structured provider context.
 * Supports GitHub, GitLab, and Azure DevOps (cloud + self-hosted).
 * Handles both HTTPS and SSH URL formats.
 *
 * @param {string} remoteUrl - Git remote URL
 * @returns {Object|null} Provider context or null if unparseable
 */
function parseGitRemoteUrl(remoteUrl) {
  if (!remoteUrl || typeof remoteUrl !== 'string') {
    return null;
  }

  const url = remoteUrl.trim();

  // Normalize SSH URLs to HTTPS format for easier parsing
  // git@host:path → https://host/path
  let normalizedUrl = url;
  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    const [, host, urlPath] = sshMatch;
    normalizedUrl = `https://${host}/${urlPath}`;
  }

  // Remove .git suffix if present
  normalizedUrl = normalizedUrl.replace(/\.git$/, '');

  // Azure DevOps: https://dev.azure.com/org/project/_git/repo
  // Azure Legacy: https://org.visualstudio.com/project/_git/repo
  // Azure SSH: git@ssh.dev.azure.com:v3/org/project/repo
  const azureMatch =
    normalizedUrl.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)/) ||
    normalizedUrl.match(/https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)/) ||
    // After normalization, `git@ssh.dev.azure.com:v3/org/project/repo` becomes
    // `https://ssh.dev.azure.com/v3/org/project/repo`
    normalizedUrl.match(/https:\/\/ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/([^/]+)/);

  if (azureMatch) {
    const [, orgPart, project, repo] = azureMatch;
    // For dev.azure.com, org is the first path segment
    // For visualstudio.com, org is the subdomain
    const isLegacy = normalizedUrl.includes('visualstudio.com');
    const azureOrg = isLegacy
      ? `https://${orgPart}.visualstudio.com`
      : `https://dev.azure.com/${orgPart}`;

    return {
      provider: 'azure-devops',
      host: isLegacy ? `${orgPart}.visualstudio.com` : 'dev.azure.com',
      azureOrg,
      azureProject: project,
      repo,
    };
  }

  // GitHub: https://github.com/org/repo
  // GitLab: https://gitlab.com/org/repo (or self-hosted)
  // Generic: https://host/org/repo
  const httpsMatch = normalizedUrl.match(/https?:\/\/([^/]+)\/([^/]+)\/([^/]+)/);
  if (httpsMatch) {
    const [, host, org, repo] = httpsMatch;

    let provider = null;
    if (host === 'github.com') {
      provider = 'github';
    } else if (host.includes('gitlab')) {
      // Matches gitlab.com or any gitlab.* subdomain or *gitlab* in hostname
      provider = 'gitlab';
    } else {
      // Unknown provider - could be self-hosted GitLab or other
      // Return null to fall back to settings
      return null;
    }

    return {
      provider,
      host,
      org,
      repo,
      fullRepo: `${org}/${repo}`,
    };
  }

  return null;
}

/**
 * @param {string} [dir=process.cwd()]
 * @returns {Promise<string>}
 */
function getRoot(dir = process.cwd()) {
  return execSync('git rev-parse --show-toplevel', { cwd: dir, encoding: 'utf8' }).trim();
}

/**
 * @param {string} [dir=process.cwd()]
 * @returns {Promise<boolean>}
 */
function isRepo(dir = process.cwd()) {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch (err) {
    if (err) {
      /* ignore */
    }
    return false;
  }
}

/**
 * @param {string} remoteName
 * @returns {Promise<string>}
 */
function getRemoteUrl(remoteName = 'origin') {
  return execSync(`git remote get-url ${remoteName}`, { encoding: 'utf8' }).trim();
}

/**
 * @param {string} remoteName
 * @param {string} branchName
 * @returns {Promise<void>}
 */
function push(remoteName, branchName) {
  execSync(`git push ${remoteName} ${branchName}`);
}

async function detectContext(cwd = process.cwd()) {
  if (!(await isRepo(cwd))) {
    return null;
  }

  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd, encoding: 'utf8' }).trim();
    const parsedUrl = parseGitRemoteUrl(remoteUrl);
    if (!parsedUrl) {
      return null;
    }

    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
    const commitId = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim();

    return {
      ...parsedUrl,
      remoteUrl,
      branch,
      commit: commitId,
    };
  } catch (err) {
    if (err) {
      /* ignore */
    }
    // May fail if not a git repo, or no remote.
    return null;
  }
}

function initIsolatedCopy(sourceDir, targetDir, branchName) {
  let remoteUrl = null;
  try {
    remoteUrl = execSync('git remote get-url origin', {
      cwd: sourceDir,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch (err) {
    if (err) {
      /* ignore */
    }
    // No remote configured in source
    remoteUrl = null;
  }

  let authRemoteUrl = null;
  if (remoteUrl) {
    authRemoteUrl = remoteUrl;
    const token = _getGhToken();
    if (token && remoteUrl.startsWith('https://github.com/')) {
      authRemoteUrl = remoteUrl.replace(
        'https://github.com/',
        `https://x-access-token:${token}@github.com/`
      );
    }
  }

  const gitCommands = [
    'git init',
    authRemoteUrl ? `git remote add origin ${escapeShell(authRemoteUrl)}` : null,
    'git add -A',
    'git commit -m "Initial commit (isolated copy)" --allow-empty',
    `git checkout -b ${escapeShell(branchName)}`,
  ]
    .filter(Boolean)
    .join(' && ');

  execSync(gitCommands, {
    cwd: targetDir,
    stdio: 'pipe',
    shell: '/bin/bash',
  });
}

function worktreeAdd(worktreePath, branchName, repoRoot) {
  execSync(`git worktree add -b ${escapeShell(branchName)} ${escapeShell(worktreePath)} HEAD`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function worktreeRemove(worktreePath, repoRoot) {
  execSync(`git worktree remove --force ${escapeShell(worktreePath)}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function worktreePrune(repoRoot) {
  execSync('git worktree prune', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
}

function branchDelete(branchName, repoRoot) {
  execSync(`git branch -D ${escapeShell(branchName)}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function getWorktree(repoRoot) {
  return repoRoot;
}

function getWorktreeGitRepo(repoRoot) {
  const gitDir = execSync('git rev-parse --git-dir', { cwd: repoRoot, encoding: 'utf8' }).trim();
  if (path.isAbsolute(gitDir)) {
    return gitDir;
  }
  return path.join(repoRoot, gitDir);
}

function remotes(repoRoot) {
  const output = execSync('git remote -v', { cwd: repoRoot, encoding: 'utf8' });
  const remoteLines = output.trim().split('\n');
  const remoteMap = new Map();
  remoteLines.forEach((line) => {
    const [name, url] = line.split(/\s+/);
    if (!remoteMap.has(name)) {
      remoteMap.set(name, { name, url });
    }
  });
  return [...remoteMap.values()];
}

function changedFiles(repoRoot) {
  const output = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' });
  const lines = output
    .trim()
    .split('\n')
    .filter((line) => line.trim());

  const staged = [];
  const unstaged = [];
  const untracked = [];

  lines.forEach((line) => {
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status === '??') {
      untracked.push(file);
    } else {
      if (status[0] !== ' ') {
        staged.push(file);
      }
      if (status[1] !== ' ') {
        unstaged.push(file);
      }
    }
  });

  return { staged, unstaged, untracked };
}

function commit(message, repoRoot) {
  execSync('git add -A', { cwd: repoRoot });
  execSync(`git commit -m ${escapeShell(message)}`, { cwd: repoRoot });
  return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
}

module.exports = {
  getRoot,
  isRepo,
  getRemoteUrl,
  push,
  detectContext,
  initIsolatedCopy,
  worktreeAdd,
  worktreeRemove,
  worktreePrune,
  branchDelete,
  getWorktree,
  getWorktreeGitRepo,
  remotes,
  changedFiles,
  commit,
};
