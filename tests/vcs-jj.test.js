const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execSync } = require('../src/lib/safe-exec');

// Helper function to check if jj is installed
function isJjInstalled() {
  try {
    execSync('jj --version', { stdio: 'pipe' });
    return true;
  } catch (err) {
    if (err) {
      /* ignore */
    }
    return false;
  }
}

const describeOrSkip = isJjInstalled() ? describe : describe.skip;

describeOrSkip('VCS: jj', () => {
  let tmpDir;
  let execSyncStub;
  let jj;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zeroshot-jj-test-'));
    execSyncStub = sinon.stub(require('../src/lib/safe-exec'), 'execSync');
    // require module after stubbing to ensure mock is used
    jj = require('../lib/vcs/jj');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    execSyncStub.restore();
    sinon.restore();
  });

  it('isInstalled returns true if jj is installed', () => {
    execSyncStub.withArgs('jj --version', { stdio: 'pipe' }).returns('');
    expect(jj.isInstalled()).to.be.true;
  });

  it('isInstalled returns false if jj is not installed', () => {
    execSyncStub.withArgs('jj --version', { stdio: 'pipe' }).throws(new Error('not found'));
    expect(jj.isInstalled()).to.be.false;
  });

  describe('isWorkspaceSupported', () => {
    it('returns true for jj version 0.10.0', async () => {
      execSyncStub.withArgs('jj --version', { encoding: 'utf8' }).returns('jj 0.10.0');
      const isSupported = await jj.isWorkspaceSupported();
      expect(isSupported).to.be.true;
    });

    it('returns true for jj version > 0.10.0', async () => {
      execSyncStub.withArgs('jj --version', { encoding: 'utf8' }).returns('jj 0.11.0');
      const isSupported = await jj.isWorkspaceSupported();
      expect(isSupported).to.be.true;
    });

    it('returns false for jj version < 0.10.0', async () => {
      execSyncStub.withArgs('jj --version', { encoding: 'utf8' }).returns('jj 0.9.0');
      const isSupported = await jj.isWorkspaceSupported();
      expect(isSupported).to.be.false;
    });

    it('returns false if jj command fails', async () => {
      execSyncStub.withArgs('jj --version', { encoding: 'utf8' }).throws(new Error('not found'));
      const isSupported = await jj.isWorkspaceSupported();
      expect(isSupported).to.be.false;
    });
  });

  it('getRoot returns the repo root', async () => {
    execSyncStub.withArgs('jj root', { cwd: tmpDir, encoding: 'utf8' }).returns(`${tmpDir}\n`);
    const root = await jj.getRoot(tmpDir);
    expect(root).to.equal(tmpDir);
  });

  it('isRepo returns true for a jj repo', async () => {
    execSyncStub.withArgs('jj root', { cwd: tmpDir, stdio: 'pipe' }).returns('');
    const isRepo = await jj.isRepo(tmpDir);
    expect(isRepo).to.be.true;
  });

  it('isRepo returns false for a non-jj repo', async () => {
    execSyncStub
      .withArgs('jj root', { cwd: tmpDir, stdio: 'pipe' })
      .throws(new Error('not a repo'));
    const isRepo = await jj.isRepo(tmpDir);
    expect(isRepo).to.be.false;
  });

  it('getRemoteUrl returns the remote URL', async () => {
    execSyncStub
      .withArgs('jj git remote url origin', { encoding: 'utf8' })
      .returns('git@github.com:example/repo.git\n');
    const url = await jj.getRemoteUrl('origin');
    expect(url).to.equal('git@github.com:example/repo.git');
  });

  it('push pushes to a remote branch', async () => {
    await jj.push('origin', 'main');
    expect(execSyncStub.calledWith('jj git push --branch main --remote origin')).to.be.true;
  });

  describe('detectContext', () => {
    beforeEach(() => {
      // Successful repo detection
      execSyncStub.withArgs('jj root', sinon.match.any).returns(tmpDir);
      execSyncStub.withArgs('jj root', { cwd: sinon.match.any, stdio: 'pipe' }).returns(tmpDir);
    });
    it('returns context for a repo with a branch', async () => {
      execSyncStub
        .withArgs('jj git remote url origin', { cwd: tmpDir, encoding: 'utf8' })
        .returns('https://github.com/example/repo.git\n');
      execSyncStub
        .withArgs('jj log -r "@" --template "branches"', { cwd: tmpDir, encoding: 'utf8' })
        .returns('main\n');
      execSyncStub
        .withArgs('jj log -r "@" --template "commit_id.short()"', { cwd: tmpDir, encoding: 'utf8' })
        .returns('1234567\n');
      execSyncStub
        .withArgs('jj log -r "@" --template "change_id.short()"', { cwd: tmpDir, encoding: 'utf8' })
        .returns('abcdefg\n');

      const context = await jj.detectContext(tmpDir);
      expect(context).to.deep.equal({
        provider: 'github',
        host: 'github.com',
        org: 'example',
        repo: 'repo',
        fullRepo: 'example/repo',
        remoteUrl: 'https://github.com/example/repo.git',
        branch: 'main',
        commit: '1234567',
      });
    });

    it('returns context for a repo on an anonymous commit', async () => {
      execSyncStub
        .withArgs('jj git remote url origin', { cwd: tmpDir, encoding: 'utf8' })
        .returns('https://github.com/example/repo.git\n');
      execSyncStub
        .withArgs('jj log -r "@" --template "branches"', { cwd: tmpDir, encoding: 'utf8' })
        .returns('\n');
      execSyncStub
        .withArgs('jj log -r "@" --template "commit_id.short()"', { cwd: tmpDir, encoding: 'utf8' })
        .returns('1234567\n');
      execSyncStub
        .withArgs('jj log -r "@" --template "change_id.short()"', { cwd: tmpDir, encoding: 'utf8' })
        .returns('abcdefg\n');

      const context = await jj.detectContext(tmpDir);
      expect(context).to.deep.equal({
        provider: 'github',
        host: 'github.com',
        org: 'example',
        repo: 'repo',
        fullRepo: 'example/repo',
        remoteUrl: 'https://github.com/example/repo.git',
        branch: 'anonymous commit (abcdefg)',
        commit: '1234567',
      });
    });

    it('returns null if not a repo', async () => {
      // Redefine for this test case
      execSyncStub
        .withArgs('jj root', { cwd: sinon.match.any, stdio: 'pipe' })
        .throws(new Error('not a repo'));
      const context = await jj.detectContext(tmpDir);
      expect(context).to.be.null;
    });

    it('returns null if remote command fails', async () => {
      execSyncStub
        .withArgs('jj git remote url origin', { cwd: tmpDir, encoding: 'utf8' })
        .throws(new Error('no remote'));
      const context = await jj.detectContext(tmpDir);
      expect(context).to.be.null;
    });
  });

  it('branchDelete deletes a branch', async () => {
    await jj.branchDelete('my-branch', tmpDir);
    expect(execSyncStub.calledWith('jj branch delete my-branch', { cwd: tmpDir })).to.be.true;
  });

  describe('worktree functions', () => {
    describe('worktreeAdd', () => {
      it('uses `jj workspace add` when supported', async () => {
        const isWorkspaceSupportedStub = sinon.stub(jj, 'isWorkspaceSupported').resolves(true);
        const worktreePath = path.join(tmpDir, 'worktree');

        await jj.worktreeAdd(worktreePath, 'new-branch', tmpDir);

        expect(isWorkspaceSupportedStub.called).to.be.true;
        expect(execSyncStub.calledWith(`jj workspace add ${worktreePath}`, { cwd: tmpDir })).to.be
          .true;
        expect(execSyncStub.calledWith('jj branch create new-branch', { cwd: worktreePath })).to.be
          .true;
      });

      it('falls back to `jj git clone` when not supported', async () => {
        const isWorkspaceSupportedStub = sinon.stub(jj, 'isWorkspaceSupported').resolves(false);
        const worktreePath = path.join(tmpDir, 'worktree');

        await jj.worktreeAdd(worktreePath, 'new-branch', tmpDir);

        expect(isWorkspaceSupportedStub.called).to.be.true;
        expect(execSyncStub.calledWith(`jj git clone ${tmpDir} ${worktreePath}`)).to.be.true;
        expect(execSyncStub.calledWith('jj branch create new-branch', { cwd: worktreePath })).to.be
          .true;
      });
    });

    describe('worktreeRemove', () => {
      it('uses `jj workspace forget` when supported', async () => {
        const isWorkspaceSupportedStub = sinon.stub(jj, 'isWorkspaceSupported').resolves(true);
        const worktreePath = path.join(tmpDir, 'worktree');
        await fs.mkdir(worktreePath); // make sure dir exists

        await jj.worktreeRemove(worktreePath, tmpDir);

        expect(isWorkspaceSupportedStub.called).to.be.true;
        expect(
          execSyncStub.calledWith(`jj workspace forget --ignore-working-copy ${worktreePath}`, {
            cwd: tmpDir,
          })
        ).to.be.true;

        // Ensure directory is removed
        await expect(fs.access(worktreePath)).to.be.rejectedWith(/ENOENT/);
      });

      it('removes directory without `forget` when not supported', async () => {
        const isWorkspaceSupportedStub = sinon.stub(jj, 'isWorkspaceSupported').resolves(false);
        const worktreePath = path.join(tmpDir, 'worktree');
        await fs.mkdir(worktreePath);

        await jj.worktreeRemove(worktreePath, tmpDir);

        expect(isWorkspaceSupportedStub.called).to.be.true;
        expect(execSyncStub.neverCalledWith(sinon.match('jj workspace forget'))).to.be.true;
        await expect(fs.access(worktreePath)).to.be.rejectedWith(/ENOENT/);
      });

      it('still removes directory if `jj workspace forget` fails', async () => {
        const isWorkspaceSupportedStub = sinon.stub(jj, 'isWorkspaceSupported').resolves(true);
        execSyncStub
          .withArgs(sinon.match('jj workspace forget'))
          .throws(new Error('not a workspace'));
        const worktreePath = path.join(tmpDir, 'worktree');
        await fs.mkdir(worktreePath);

        await jj.worktreeRemove(worktreePath, tmpDir);

        expect(isWorkspaceSupportedStub.called).to.be.true;
        await expect(fs.access(worktreePath)).to.be.rejectedWith(/ENOENT/);
      });
    });

    it('worktreePrune prunes git objects', async () => {
      await jj.worktreePrune(tmpDir);
      expect(execSyncStub.calledWith('jj git prune', { cwd: tmpDir })).to.be.true;
    });

    it('initIsolatedCopy clones and checks out a branch', async () => {
      const sourceDir = tmpDir;
      const targetDir = path.join(tmpDir, 'isolated-copy');
      const branchName = 'feature-branch';

      await jj.initIsolatedCopy(sourceDir, targetDir, branchName);

      expect(execSyncStub.calledWith(`jj git clone ${sourceDir} ${targetDir}`)).to.be.true;
      expect(execSyncStub.calledWith(`jj new ${branchName}`, { cwd: targetDir })).to.be.true;
    });

    it('getWorktree returns the workspace root', async () => {
      execSyncStub
        .withArgs('jj workspace root', { cwd: tmpDir, encoding: 'utf8' })
        .returns(`${tmpDir}\n`);
      const worktree = await jj.getWorktree(tmpDir);
      expect(worktree).to.equal(tmpDir);
    });

    it('getWorktreeGitRepo returns the repo root if .git exists', async () => {
      execSyncStub.withArgs('jj root', { cwd: tmpDir, encoding: 'utf8' }).returns(`${tmpDir}\n`);
      // create a fake .git dir
      await fs.mkdir(path.join(tmpDir, '.git'));
      const gitRepo = await jj.getWorktreeGitRepo(tmpDir);
      expect(gitRepo).to.equal(tmpDir);
    });

    it('getWorktreeGitRepo returns null if .git does not exist', async () => {
      execSyncStub.withArgs('jj root', { cwd: tmpDir, encoding: 'utf8' }).returns(`${tmpDir}\n`);
      const gitRepo = await jj.getWorktreeGitRepo(tmpDir);
      expect(gitRepo).to.be.null;
    });

    it('remotes returns a list of remotes', async () => {
      const remoteOutput = 'origin\tgit@github.com:example/repo.git\n';
      execSyncStub
        .withArgs('jj git remote list', { cwd: tmpDir, encoding: 'utf8' })
        .returns(remoteOutput);
      const remotes = await jj.remotes(tmpDir);
      expect(remotes).to.deep.equal([{ name: 'origin', url: 'git@github.com:example/repo.git' }]);
    });

    it('changedFiles returns unstaged and untracked files', async () => {
      const statusOutput = {
        working_copy: {
          modified: ['modified.txt'],
          added: ['added.txt'],
          removed: [{ path: 'removed.txt' }],
          untracked: ['untracked.txt'],
        },
      };
      execSyncStub
        .withArgs('jj status --no-pager -T json', { cwd: tmpDir, encoding: 'utf8' })
        .returns(JSON.stringify(statusOutput));
      const files = await jj.changedFiles(tmpDir);
      expect(files).to.deep.equal({
        staged: [],
        unstaged: ['modified.txt', 'added.txt', 'removed.txt'],
        untracked: ['untracked.txt'],
      });
    });

    it('commit creates a commit and returns the commit id', async () => {
      const logOutput = {
        commit_id: '1234567890',
      };
      execSyncStub
        .withArgs('jj log -r "@" -T json', { cwd: tmpDir, encoding: 'utf8' })
        .returns(JSON.stringify(logOutput));
      const commitId = await jj.commit('test commit', tmpDir);
      expect(execSyncStub.calledWith('jj describe -m "test commit"', { cwd: tmpDir })).to.be.true;
      expect(execSyncStub.calledWith('jj new', { cwd: tmpDir })).to.be.true;
      expect(commitId).to.equal('1234567890');
    });
  });
});
