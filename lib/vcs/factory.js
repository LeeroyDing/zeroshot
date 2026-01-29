// lib/vcs/factory.js
const fs = require('fs');
const path = require('path');
const git = require('./git');
const jj = require('./jj');

let vcs = null;

function detectVcs(cwd = process.cwd()) {
    let dir = cwd;
    while (true) {
        if (fs.existsSync(path.join(dir, '.jj'))) {
            return 'jj';
        }
        if (fs.existsSync(path.join(dir, '.git'))) {
            return 'git';
        }
        const parentDir = path.dirname(dir);
        if (parentDir === dir) {
            break;
        }
        dir = parentDir;
    }
    return null;
}

/**
 * @returns {Promise<import('./interface').Vcs>}
 */
async function getVcs() {
    if (vcs) {
        return vcs;
    }

    const vcsType = await detectVcs();
    if (vcsType === 'jj') {
        if (!jj.isInstalled()) {
            throw new Error('`jj` repository detected, but `jj` command not found. Please install it.');
        }
        vcs = jj;
    } else if (vcsType === 'git') {
        vcs = git;
    } else {
        throw new Error('No supported version control system detected in this or any parent directories.');
    }
    return vcs;
}

module.exports = {
    getVcs,
    detectVcs,
};
