// lib/vcs/jj.js
const { execSync } = require('../../src/lib/safe-exec');
const git = require('./git');
const fs = require('fs/promises');
const path = require('path');
const { parseGitRemoteUrl } = require('./git');
const semver = require('semver');

let isWorkspaceSupportedPromise;

async function isWorkspaceSupported() {
    if (isWorkspaceSupportedPromise) {
        return isWorkspaceSupportedPromise;
    }

    isWorkspaceSupportedPromise = (async () => {
        try {
            const versionOutput = execSync('jj --version', { encoding: 'utf8' });
            const version = versionOutput.match(/jj ([\d.]+)/)[1];
            return semver.gte(version, '0.10.0');
        } catch (e) {
            return false;
        }
    })();

    return isWorkspaceSupportedPromise;
}

function isInstalled() {
    try {
        execSync('jj --version', { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * @param {string} [dir=process.cwd()]
 * @returns {Promise<string>}
 */
async function getRoot(dir = process.cwd()) {
    return execSync('jj root', { cwd: dir, encoding: 'utf8' }).trim();
}

/**
 * @param {string} [dir=process.cwd()]
 * @returns {Promise<boolean>}
 */
async function isRepo(dir = process.cwd()) {
    try {
        execSync('jj root', { cwd: dir, stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * @param {string} remoteName
 * @returns {Promise<string>}
 */
async function getRemoteUrl(remoteName = 'origin') {
    return execSync(`jj git remote url ${remoteName}`, { encoding: 'utf8' }).trim();
}

/**
 * @param {string} remoteName
 * @param {string} branchName
 * @returns {Promise<void>}
 */
async function push(remoteName, branchName) {
    execSync(`jj git push --branch ${branchName} --remote ${remoteName}`);
}

/**
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<object|null>}
 */
async function detectContext(cwd = process.cwd()) {
    if (!await isRepo(cwd)) {
        return null;
    }

    try {
        const remoteUrl = execSync('jj git remote url origin', { cwd, encoding: 'utf8' }).trim();
        const parsedUrl = parseGitRemoteUrl(remoteUrl);
        if (!parsedUrl) {
            return null;
        }

        const branches = execSync('jj log -r "@" --template "branches"', { cwd, encoding: 'utf8' }).trim();
        let branch = branches.split('\n')[0].trim();
        const commit = execSync('jj log -r "@" --template "commit_id.short()"', { cwd, encoding: 'utf8' }).trim();
        const changeId = execSync('jj log -r "@" --template "change_id.short()"', { cwd, encoding: 'utf8' }).trim();

        if (!branch) {
            branch = `anonymous commit (${changeId})`;
        }

        return {
            ...parsedUrl,
            remoteUrl,
            branch,
            commit,
        };
    } catch (e) {
        // May fail if not a git repo, or no remote.
        return null;
    }
}

async function initIsolatedCopy(sourceDir, targetDir, branchName) {
    execSync(`jj git clone ${sourceDir} ${targetDir}`);
    execSync(`jj new ${branchName}`, { cwd: targetDir });
}

async function worktreeAdd(worktreePath, branchName, repoRoot) {
    if (await isWorkspaceSupported()) {
        execSync(`jj workspace add ${worktreePath}`, { cwd: repoRoot });
    } else {
        execSync(`jj git clone ${repoRoot} ${worktreePath}`);
    }
    execSync(`jj branch create ${branchName}`, { cwd: worktreePath });
    // jj new creates a new change, which isn't what we want here.
    // We just want a branch pointing to the current commit.
}

async function worktreeRemove(worktreePath, repoRoot) {
    if (await isWorkspaceSupported()) {
        try {
            // --ignore-working-copy so we don't fail if there are untracked files
            execSync(`jj workspace forget --ignore-working-copy ${worktreePath}`, { cwd: repoRoot });
        } catch (e) {
            // This might fail if it's not a workspace, which is fine.
            // We'll just fall back to rm -rf.
            // This can happen if the workspace was created with an older jj version.
        }
    }
    await fs.rm(worktreePath, { recursive: true, force: true });
}

async function worktreePrune(repoRoot) {
    execSync('jj git prune', { cwd: repoRoot });
}

async function branchDelete(branchName, repoRoot) {
    execSync(`jj branch delete ${branchName}`, { cwd: repoRoot });
}

async function getWorktree(repoRoot) {
    return execSync('jj workspace root', { cwd: repoRoot, encoding: 'utf8' }).trim();
}

async function getWorktreeGitRepo(repoRoot) {
    const root = await getRoot(repoRoot);
    try {
        // check if .git dir exists
        await fs.stat(path.join(root, '.git'));
        return root;
    } catch (e) {
        // Did not find a git repo
        return null;
    }
}

async function remotes(repoRoot) {
    const output = execSync('jj git remote list', { cwd: repoRoot, encoding: 'utf8' });
    return output
        .trim()
        .split('\n')
        .map((line) => {
            const [name, url] = line.split(/\s+/);
            return { name, url };
        })
        .filter(remote => remote.name && remote.url);
}

async function changedFiles(repoRoot) {
    const output = execSync('jj status --no-pager -T json', { cwd: repoRoot, encoding: 'utf8' });
    const status = JSON.parse(output);

    const unstaged = [
        ...status.working_copy.modified,
        ...status.working_copy.added,
        ...status.working_copy.removed.map(f => f.path),
    ];
    const untracked = status.working_copy.untracked;

    return { unstaged, untracked, staged: [] };
}

async function commit(message, repoRoot) {
    execSync(`jj describe -m "${message}"`, { cwd: repoRoot });
    const logOutput = execSync('jj log -r "@" -T json', { cwd: repoRoot, encoding: 'utf8' });
    const log = JSON.parse(logOutput);
    execSync('jj new', { cwd: repoRoot });
    return log.commit_id;
}

module.exports = {
    isInstalled,
    getRoot,
    getRemoteUrl,
    push,
    detectContext,
    isRepo,
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
    isWorkspaceSupported,
};