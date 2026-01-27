/* eslint-disable max-len */

/**
 * Git Pusher Agent Template
 *
 * Generates platform-specific git-pusher agent configurations.
 * Eliminates duplication across github/gitlab/azure JSON files.
 *
 * Single source of truth for:
 * - Trigger logic (validation consensus detection)
 * - Agent structure (id, role, modelLevel, output)
 * - Prompt template with platform-specific commands
 */

/**
 * Shared trigger logic for detecting when all validators have approved.
 * This is the SINGLE source of truth - no more duplicating across 3 JSON files.
 */
const SHARED_TRIGGER_SCRIPT = `const validators = cluster.getAgentsByRole('validator');
const lastPush = ledger.findLast({ topic: 'IMPLEMENTATION_READY' });
if (!lastPush) return false;
if (validators.length === 0) return true;
const results = ledger.query({ topic: 'VALIDATION_RESULT', since: lastPush.timestamp });
if (results.length < validators.length) return false;
const allApproved = results.every(r => r.content?.data?.approved === 'true' || r.content?.data?.approved === true);
if (!allApproved) return false;
const hasRealEvidence = results.every(r => {
  const criteria = r.content?.data?.criteriaResults || [];
  return criteria.every(c => {
    return c.evidence?.command && typeof c.evidence?.exitCode === 'number' && c.evidence?.output?.length > 10;
  });
});
return hasRealEvidence;`;

/**
 * Platform-specific CLI commands and terminology
 */
const PLATFORM_CONFIGS = {
  github: {
    prName: 'PR',
    prNameLower: 'pull request',
    createCmd: 'gh pr create --title "feat: {{issue_title}}" --body "Closes #{{issue_number}}"',
    mergeCmd: 'gh pr merge --merge --auto',
    mergeFallbackCmd: 'gh pr merge --merge',
    prUrlExample: 'https://github.com/owner/repo/pull/123',
    outputFields: { urlField: 'pr_url', numberField: 'pr_number', mergedField: 'merged' },
  },
  gitlab: {
    prName: 'MR',
    prNameLower: 'merge request',
    createCmd:
      'glab mr create --title "feat: {{issue_title}}" --description "Closes #{{issue_number}}"',
    mergeCmd: 'glab mr merge --auto-merge',
    mergeFallbackCmd: 'glab mr merge',
    prUrlExample: 'https://gitlab.com/owner/repo/-/merge_requests/123',
    outputFields: { urlField: 'mr_url', numberField: 'mr_number', mergedField: 'merged' },
  },
  'azure-devops': {
    prName: 'PR',
    prNameLower: 'pull request',
    createCmd:
      'az repos pr create --title "feat: {{issue_title}}" --description "Closes #{{issue_number}}"',
    mergeCmd: 'az repos pr update --id <PR_ID> --auto-complete true',
    mergeFallbackCmd: 'az repos pr update --id <PR_ID> --status completed',
    prUrlExample: 'https://dev.azure.com/org/project/_git/repo/pullrequest/123',
    outputFields: {
      urlField: 'pr_url',
      numberField: 'pr_number',
      mergedField: 'merged',
      autoCompleteField: 'auto_complete',
    },
    // Azure requires extracting PR ID from create output
    requiresPrIdExtraction: true,
  },
};

/**
 * Generate the prompt for a specific platform using Git
 * @param {Object} config - Platform configuration from PLATFORM_CONFIGS
 * @returns {string} The complete prompt with platform-specific commands
 */
function generateGitPrompt(config) {
  const {
    prName,
    prNameLower,
    createCmd,
    mergeCmd,
    mergeFallbackCmd,
    prUrlExample,
    outputFields,
    requiresPrIdExtraction,
  } = config;

  // Azure-specific instructions for PR ID extraction
  const azurePrIdNote = requiresPrIdExtraction
    ? `\n\n💡 IMPORTANT: The output will contain the PR ID. You MUST extract it for the next step.
Look for output like: "Created PR 123" or parse the URL for the PR number.
Save the PR ID to a variable for step 6.`
    : '';

  // Azure uses different merge terminology
  const mergeDescription = requiresPrIdExtraction
    ? 'SET AUTO-COMPLETE (MANDATORY - THIS IS NOT OPTIONAL)'
    : `MERGE THE ${prName} (MANDATORY - THIS IS NOT OPTIONAL)`;

  const mergeExplanation = requiresPrIdExtraction
    ? `Replace <PR_ID> with the actual PR number from step 5.
This enables auto-complete (auto-merge when CI passes).

If auto-complete is not available or you need to merge immediately:`
    : `This sets auto-merge. If it fails (e.g., no auto-merge enabled), try:`;

  const postMergeStatus = requiresPrIdExtraction
    ? 'PR IS CREATED AND AUTO-COMPLETE IS SET'
    : `${prName} IS MERGED`;

  const finalOutputNote = requiresPrIdExtraction
    ? `ONLY after the PR is created and auto-complete is set, output:
\`\`\`json
{\