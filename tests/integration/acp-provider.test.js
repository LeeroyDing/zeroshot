const proxyquire = require('proxyquire');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

describe('ACP Provider Integration', function () {
  this.timeout(30000);

  it('should connect to mock agent and get a response', (done) => {
    const mockAgentPath = path.resolve(__dirname, '../mock-acp-agent.js');
    const nodePath = process.execPath;

    if (!fs.existsSync(mockAgentPath)) {
      return done(new Error(`Mock agent not found at ${mockAgentPath}`));
    }

    const mockSettings = {
      loadSettings: () => ({
        providerSettings: {
          acp: {
            transport: 'stdio',
            command: `${nodePath} ${mockAgentPath}`,
          },
        },
      }),
    };

    const ACPProvider = proxyquire('../../src/providers/acp', {
      '../../../lib/settings': mockSettings,
    });

    const provider = new ACPProvider();
    const prompt = 'Hello ACP';
    const cmdSpec = provider.buildCommand(prompt, {});

    const proc = spawn(cmdSpec.binary, cmdSpec.args, {
      env: { ...cmdSpec.env, PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      try {
        if (code !== 0) {
          console.error('Bridge Stderr:', stderr);
          return done(new Error(`Bridge process exited with code ${code}`));
        }

        const lines = stdout.trim().split('\n');
        const messages = lines
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch (err) {
              if (err) {
                /* ignore */
              }
              return null;
            }
          })
          .filter((x) => x);

        const response = messages.find((m) => m.type === 'text');

        if (!response) {
          console.error('Bridge Output:', stdout);
          console.error('Bridge Stderr:', stderr);
          return done(new Error('No text response found in output'));
        }

        let content;
        try {
          content = JSON.parse(response.text);
        } catch (parseErr) {
          return done(
            new Error(`Response text was not JSON: ${response.text} (${parseErr.message})`)
          );
        }

        assert.strictEqual(content.message, 'I am a fully functional ACP agent.');
        assert.strictEqual(content.data.fact, 'Pickle Rick rules');

        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
