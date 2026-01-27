const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('VCS Abstraction Layer', () => {
  let execSyncStub;
  let jj, git;

  beforeEach(() => {
    execSyncStub = sinon.stub();
    const jjModule = proxyquire('../../lib/vcs/jj', {
      '../../src/lib/safe-exec': { execSync: execSyncStub },
    });
    jj = jjModule;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('jj implementation', () => {
    it('isInstalled should return true if jj is installed', () => {
      execSyncStub.withArgs('jj --version', { stdio: 'pipe' }).returns('');
      assert.strictEqual(jj.isInstalled(), true);
    });

    it('isInstalled should return false if jj is not installed', () => {
      execSyncStub.withArgs('jj --version', { stdio: 'pipe' }).throws(new Error('not found'));
      assert.strictEqual(jj.isInstalled(), false);
    });

    it('getRoot should return the root of the repo', async () => {
      execSyncStub.withArgs('jj root', { cwd: process.cwd(), encoding: 'utf8' }).returns('/path/to/repo\n');
      const root = await jj.getRoot();
      assert.strictEqual(root, '/path/to/repo');
    });

    it('getRemoteUrl should return the remote url', async () => {
      execSyncStub.withArgs('jj git remote url origin', { encoding: 'utf8' }).returns('https://github.com/org/repo.git\n');
      const url = await jj.getRemoteUrl('origin');
      assert.strictEqual(url, 'https://github.com/org/repo.git');
    });

    it('push should call jj git push', async () => {
      await jj.push('origin', 'main');
      assert(execSyncStub.calledWith('jj git push --branch main --remote origin'));
    });
  });
});
