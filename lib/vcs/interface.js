/**
 * @typedef {object} Vcs
 * @property {(dir: string) => Promise<string>} getRoot - a function that returns the root of the repo
 * @property {(remoteName: string) => Promise<string>} getRemoteUrl - a function that returns the remote url
 * @property {(remoteName: string, branchName: string) => Promise<void>} push - a function that pushes to a remote branch
 * @property {(cwd: string) => Promise<object|null>} detectContext - a function that detects the repo context
 * @property {(dir: string) => Promise<boolean>} isRepo - a function that checks if a directory is a repository
 * @property {(sourceDir: string, targetDir: string, branchName: string) => Promise<void>} initIsolatedCopy - a function that initializes an isolated copy of a repository
 * @property {(worktreePath: string, branchName: string, repoRoot: string) => Promise<void>} worktreeAdd - a function that creates a new worktree
 * @property {(worktreePath: string, repoRoot: string) => Promise<void>} worktreeRemove - a function that removes a worktree
 * @property {(repoRoot: string) => Promise<void>} worktreePrune - a function that prunes worktree metadata
 * @property {(branchName: string, repoRoot: string) => Promise<void>} branchDelete - a function that deletes a branch
 * @property {(repoRoot: string) => Promise<string>} getWorktree - a function that returns the current worktree path
 * @property {(repoRoot: string) => Promise<string|null>} getWorktreeGitRepo - a function that returns the git repo path for a worktree
 * @property {(repoRoot: string) => Promise<{name: string, url: string}[]>} remotes - a function that lists remotes
 * @property {(repoRoot: string) => Promise<{staged: string[], unstaged: string[], untracked: string[]}>} changedFiles - a function that returns changed files
 * @property {(message: string, repoRoot: string) => Promise<string>} commit - a function that creates a commit
 */
