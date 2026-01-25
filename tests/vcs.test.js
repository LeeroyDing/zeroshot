const assert = require('assert');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const safeExec = require('../src/lib/safe-exec');

describe('VCS Abstraction Layer', function () {
  let execSyncStub;
  let existsSyncStub;
  let gitUtils, hgUtils, vcs;

  beforeEach(function () {
    execSyncStub = sinon.stub(safeExec, 'execSync');
    existsSyncStub = sinon.stub(fs, 'existsSync');
    // require modules after stubbing
    gitUtils = require('../lib/git-utils');
    hgUtils = require('../lib/hg-utils');
    vcs = require('../lib/vcs');
  });

  afterEach(function () {
    execSyncStub.restore();
    existsSyncStub.restore();
    delete require.cache[require.resolve('../lib/git-utils')];
    delete require.cache[require.resolve('../lib/hg-utils')];
    delete require.cache[require.resolve('../lib/vcs')];
  });

  describe('git-utils', function () {
    it('isGitRepo should return true for git repo', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).returns('');
      assert.strictEqual(gitUtils.isGitRepo(), true);
    });

    it('isGitRepo should return false for non-git repo', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).throws(new Error());
      assert.strictEqual(gitUtils.isGitRepo(), false);
    });

    it('getRepoRoot should return git repo root', function () {
      execSyncStub
        .withArgs('git rev-parse --show-toplevel', sinon.match.any)
        .returns('/path/to/repo\n');
      assert.strictEqual(gitUtils.getRepoRoot(), '/path/to/repo');
    });

    it('getBranch should return current git branch', function () {
      execSyncStub.withArgs('git rev-parse --abbrev-ref HEAD', sinon.match.any).returns('main\n');
      assert.strictEqual(gitUtils.getBranch(), 'main');
    });

    it('getWorktreePaths should return worktree paths', function () {
      const porcelainOutput = [
        'worktree /path/to/repo',
        'HEAD 1234567 [main]',
        'branch refs/heads/main',
        'worktree /path/to/other-worktree',
        'HEAD 7654321 [feature-branch]',
        'branch refs/heads/feature-branch',
      ].join('\n');
      execSyncStub
        .withArgs('git worktree list --porcelain', sinon.match.any)
        .returns(porcelainOutput);
      execSyncStub
        .withArgs('git rev-parse --show-toplevel', sinon.match.any)
        .returns('/path/to/repo\n');
      const paths = gitUtils.getWorktreePaths();
      assert.deepStrictEqual(paths, ['/path/to/repo', '/path/to/other-worktree']);
    });
  });

  describe('hg-utils', function () {
    it('isHgRepo should return true for hg repo', function () {
      existsSyncStub.withArgs(path.join('/path/to/repo', '.hg')).returns(true);
      assert.strictEqual(hgUtils.isHgRepo('/path/to/repo'), true);
    });

    it('isHgRepo should find .hg in parent directory', function () {
      existsSyncStub.withArgs(path.join('/path/to/repo', '.hg')).returns(true);
      assert.strictEqual(hgUtils.isHgRepo('/path/to/repo/subdir'), true);
    });

    it('isHgRepo should return false for non-hg repo', function () {
      existsSyncStub.returns(false);
      assert.strictEqual(hgUtils.isHgRepo('/path/to/repo'), false);
    });

    it('getHgRepoRoot should return hg repo root', function () {
      execSyncStub.withArgs('hg root', sinon.match.any).returns('/path/to/hg/repo\n');
      assert.strictEqual(hgUtils.getHgRepoRoot(), '/path/to/hg/repo');
    });

    it('getHgBranch should return current hg branch', function () {
      execSyncStub.withArgs('hg branch', sinon.match.any).returns('default\n');
      assert.strictEqual(hgUtils.getHgBranch(), 'default');
    });

    it('getHgWorktreePaths should return repo root', function () {
      execSyncStub.withArgs('hg root', sinon.match.any).returns('/path/to/hg/repo\n');
      assert.deepStrictEqual(hgUtils.getHgWorktreePaths(), ['/path/to/hg/repo']);
    });
  });

  describe('vcs', function () {
    it('getVCS should detect git', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).returns('');
      existsSyncStub.returns(false);
      assert.strictEqual(vcs.getVCS(), 'git');
    });

    it('getVCS should detect hg', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).throws(new Error());
      existsSyncStub.withArgs(sinon.match(/\.hg$/)).returns(true);
      assert.strictEqual(vcs.getVCS(process.cwd()), 'hg');
    });

    it('getVCS should return null for no vcs', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).throws(new Error());
      existsSyncStub.returns(false);
      assert.strictEqual(vcs.getVCS(), null);
    });

    it('getRepoRoot should delegate to git', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).returns('');
      execSyncStub
        .withArgs('git rev-parse --show-toplevel', sinon.match.any)
        .returns('/path/to/git/repo\n');
      assert.strictEqual(vcs.getRepoRoot(), '/path/to/git/repo');
    });

    it('getRepoRoot should delegate to hg', function () {
      execSyncStub.withArgs('git rev-parse --git-dir', sinon.match.any).throws(new Error());
      existsSyncStub.withArgs(sinon.match(/\.hg$/)).returns(true);
      execSyncStub.withArgs('hg root', sinon.match.any).returns('/path/to/hg/repo\n');
      assert.strictEqual(vcs.getRepoRoot(), '/path/to/hg/repo');
    });
  });
});
