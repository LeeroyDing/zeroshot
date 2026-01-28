const BaseProvider = require('../base-provider');

class ACPProvider extends BaseProvider {
  constructor() {
    super({ name: 'acp', displayName: 'ACP', cliCommand: 'acp' });
  }

  isAvailable() {
    return true;
  }

  getCliFeatures() {
    return {
      supportsJson: true,
      supportsModel: true,
      supportsVariant: false,
      supportsCwd: true,
      supportsAutoApprove: true,
      unknown: false,
    };
  }

  getCliPath() {
    // Return the bridge script path
    return require('path').join(__dirname, 'bridge.js');
  }

  getDefaultSettings() {
    return {
      maxLevel: 'level3',
      minLevel: 'level1',
      defaultLevel: 'level2',
      levelOverrides: {},
      transport: 'stdio', // 'stdio' or 'http'
      command: 'npx @agentclientprotocol/agent-template', // Default agent
      url: '', // For HTTP transport
    };
  }

  buildCommand(prompt, options) {
    // Get settings to find the configured ACP agent command
    const { loadSettings } = require('../../../lib/settings');
    const settings = loadSettings();
    const acpSettings = settings.providerSettings?.acp || this.getDefaultSettings();
    
    const bridgePath = this.getCliPath();
    const nodePath = process.execPath;

    const args = [
      bridgePath,
      '--prompt', prompt,
      '--transport', acpSettings.transport || 'stdio',
    ];

    if (acpSettings.transport === 'stdio') {
      args.push('--command', acpSettings.command);
    } else if (acpSettings.url) {
      args.push('--url', acpSettings.url);
    }

    return {
      binary: nodePath,
      args: args,
      env: process.env,
    };
  }

  parseEvent(line) {
    try {
      const event = JSON.parse(line);
      // Bridge already outputs compatible NDJSON, just return it
      return event;
    } catch {
      return null;
    }
  }

  getDefaultLevel() {
    return 'level2';
  }

  getLevelMapping() {
    return {
      level1: { model: 'acp-agent', rank: 1 },
      level2: { model: 'acp-agent', rank: 2 },
      level3: { model: 'acp-agent', rank: 3 },
    };
  }

  getModelCatalog() {
    return {
      'acp-agent': { id: 'acp-agent', displayName: 'ACP Agent' },
    };
  }
}

module.exports = ACPProvider;
