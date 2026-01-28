const { expect } = require('chai');
const { getProvider } = require('../../../src/providers');
const ACPProvider = require('../../../src/providers/acp');
const path = require('path');

describe('ACPProvider', () => {
  it('should be registered correctly', () => {
    const provider = getProvider('acp');
    expect(provider).to.be.an.instanceOf(ACPProvider);
  });

  it('should have correct default settings', () => {
    const provider = new ACPProvider();
    const defaults = provider.getDefaultSettings();
    expect(defaults).to.have.property('transport', 'stdio');
    expect(defaults).to.have.property('command').that.contains('agent-template');
  });

  it('should build correct command for stdio transport', () => {
    const provider = new ACPProvider();
    const commandSpec = provider.buildCommand('test prompt', {});
    
    expect(commandSpec.binary).to.equal(process.execPath);
    expect(commandSpec.args).to.include(path.join(process.cwd(), 'src/providers/acp/bridge.js'));
    expect(commandSpec.args).to.include('--prompt');
    expect(commandSpec.args).to.include('test prompt');
    expect(commandSpec.args).to.include('--transport');
    expect(commandSpec.args).to.include('stdio');
  });
});
