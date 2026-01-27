const { expect } = require('chai');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execSync } = require('../../src/lib/safe-exec');
const jj = require('../../lib/vcs/jj');

// Helper function to check if jj is installed
function isJjInstalled() {
    try {
        execSync('jj --version', { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

const describeOrSkip = isJjInstalled() ? describe : describe.skip;

describeOrSkip('VCS: jj (integration)', () => {
    let repoDir;

    beforeEach(async () => {
        repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zeroshot-jj-integration-test-'));
        execSync('jj git init', { cwd: repoDir });
        execSync('jj describe -m "Initial commit"', { cwd: repoDir });
        execSync('touch file.txt', { cwd: repoDir });
        execSync('jj new -m "Add file"', { cwd: repoDir });
    });

    afterEach(async () => {
        await fs.rm(repoDir, { recursive: true, force: true });
    });

    it('detects a jj repo correctly', async () => {
        expect(await jj.isRepo(repoDir)).to.be.true;
        expect(await jj.isRepo(os.tmpdir())).to.be.false;
    });

    it('gets the repo root', async () => {
        const root = await jj.getRoot(repoDir);
        expect(root).to.equal(repoDir);
    });

    describe('worktree operations', () => {
        let worktreePath;

        beforeEach(async () => {
            worktreePath = path.join(repoDir, '..', 'zeroshot-jj-worktree');
        });

        afterEach(async () => {
            try {
                // Fails if test cleaned up already
                await fs.rm(worktreePath, { recursive: true, force: true });
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
        });

        it('adds and removes a worktree', async () => {
            await jj.worktreeAdd(worktreePath, 'test-branch', repoDir);

            // Verify worktree exists
            const worktreeRoot = await jj.getRoot(worktreePath);
            expect(worktreeRoot).to.equal(repoDir);

            const branchOutput = execSync('jj branch list', { cwd: worktreePath, encoding: 'utf8' });
            expect(branchOutput).to.include('test-branch');

            await jj.worktreeRemove(worktreePath, repoDir);

            // Verify worktree does not exist
            try {
                await fs.access(worktreePath);
                expect.fail('Worktree directory should have been removed');
            } catch (e) {
                expect(e.code).to.equal('ENOENT');
            }

            if (await jj.isWorkspaceSupported()) {
                const workspaceList = execSync('jj workspace list', { cwd: repoDir, encoding: 'utf8' });
                expect(workspaceList).to.not.include(worktreePath);
            }
        });
    });

    it('detects context', async () => {
        execSync('jj git remote add origin https://github.com/example/repo.git', { cwd: repoDir });
        const context = await jj.detectContext(repoDir);
        expect(context).to.have.property('provider', 'github');
        expect(context).to.have.property('org', 'example');
        expect(context).to.have.property('repo', 'repo');
        expect(context).to.have.property('branch');
    });

    it('deletes a branch', async () => {
        execSync('jj branch create my-branch', { cwd: repoDir });
        let branches = execSync('jj branch list', { cwd: repoDir, encoding: 'utf8' });
        expect(branches).to.include('my-branch');

        await jj.branchDelete('my-branch', repoDir);
        branches = execSync('jj branch list', { cwd: repoDir, encoding: 'utf8' });
        expect(branches).to.not.include('my-branch');
    });

    it('lists remotes', async () => {
        execSync('jj git remote add origin https://github.com/example/repo.git', { cwd: repoDir });
        const remotes = await jj.remotes(repoDir);
        expect(remotes).to.deep.equal([
            { name: 'origin', url: 'https://github.com/example/repo.git' },
        ]);
    });

    it('detects changed files', async () => {
        // We need to create a file to be deleted
        await fs.writeFile(path.join(repoDir, 'file-to-delete.txt'), 'delete me');
        execSync('jj new -m "add file to delete"', { cwd: repoDir });

        // Now we perform the changes
        await fs.writeFile(path.join(repoDir, 'file.txt'), 'modified');
        await fs.writeFile(path.join(repoDir, 'new-file.txt'), 'new');
        await fs.rm(path.join(repoDir, 'file-to-delete.txt'));
        await fs.writeFile(path.join(repoDir, 'untracked.txt'), 'untracked');


        const { unstaged, untracked } = await jj.changedFiles(repoDir);
        
        // Normalizing paths for cross-platform compatibility
        const normalize = (p) => p.replace(/\\/g, '/');
        const unstagedNormalized = unstaged.map(normalize).sort();
        const untrackedNormalized = untracked.map(normalize).sort();

        expect(unstagedNormalized).to.deep.equal(['file-to-delete.txt', 'file.txt', 'new-file.txt']);
        expect(untrackedNormalized).to.deep.equal(['untracked.txt']);
    });

    it('creates a commit', async () => {
        await fs.writeFile(path.join(repoDir, 'file.txt'), 'new content');
        const commitId = await jj.commit('New test commit', repoDir);

        const logOutput = execSync('jj log -r "@" -T json', { cwd: repoDir, encoding: 'utf8' });
        const log = JSON.parse(logOutput);

        expect(log.commit_id).to.equal(commitId);
        expect(log.description).to.equal('New test commit');

        const fileContent = execSync('jj file show file.txt', { cwd: repoDir, encoding: 'utf8' });
        expect(fileContent).to.equal('new content');
    });
});
