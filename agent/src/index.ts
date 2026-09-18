import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { SandboxRunner } from './runner';
import { RemediationLLMClient } from './llm';
import { GitManager } from './git';

// Load environment variables from .env in hephaestus-poc or current directory
const candidateEnvPaths = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
];

for (const p of candidateEnvPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const resolveTargetDir = (): string => {
  if (process.env.MOCK_TARGET_DIR) {
    if (path.isAbsolute(process.env.MOCK_TARGET_DIR)) {
      return process.env.MOCK_TARGET_DIR;
    }
    const fromCwd = path.resolve(process.cwd(), process.env.MOCK_TARGET_DIR);
    if (fs.existsSync(fromCwd)) return fromCwd;
    const fromAgent = path.resolve(__dirname, '../../', process.env.MOCK_TARGET_DIR);
    if (fs.existsSync(fromAgent)) return fromAgent;
  }
  return path.resolve(__dirname, '../../mock-target-app');
};

const TARGET_APP_DIR = resolveTargetDir();
const TARGET_PACKAGE_NAME = 'uuid';
const TARGET_SECURE_VERSION = '^9.0.0';
const TARGET_FILE_REL = path.join('src', 'idGenerator.js');
const BRANCH_NAME = 'fix/remediate-uuid-breaking-change';
const MAX_HEALING_ATTEMPTS = 3;

function printBanner() {
  console.log(
    chalk.cyan(`
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                                                                       ║
  ║      🔥  H E F A E T U S  ::  Autonomous Remediation Agent  🔥       ║
  ║      Self-Healing DevSecOps Pipeline for Breaking Dependency Bumps   ║
  ║                                                                       ║
  ╚═══════════════════════════════════════════════════════════════════════╝
  `)
  );
}

async function main() {
  printBanner();

  const runner = new SandboxRunner();
  const llm = new RemediationLLMClient();
  const git = new GitManager(TARGET_APP_DIR);

  const runnerInfo = await runner.getActiveModeDescription();
  const llmInfo = llm.getProviderInfo();

  console.log(chalk.bold('🛠️  Agent Runtime Configuration:'));
  console.log(`   • Target App Directory : ${chalk.yellow(TARGET_APP_DIR)}`);
  console.log(`   • Execution Sandbox    : ${chalk.green(runnerInfo)}`);
  console.log(
    `   • Remediation Model    : ${chalk.magenta(
      `${llmInfo.provider.toUpperCase()} (${llmInfo.model})`
    )}`
  );
  console.log(`   • Target Git Branch    : ${chalk.blue(BRANCH_NAME)}`);
  console.log(
    `   • Healing Max Loops    : ${chalk.white(MAX_HEALING_ATTEMPTS)}\n`
  );

  // Initialize Git baseline on main and checkout feature branch
  console.log(chalk.bold('🌿 Initializing Git workflow & branching...'));
  await git.ensureGitRepo();
  await git.prepareRemediationBranch(BRANCH_NAME);
  console.log(`✔ Switched to clean remediation branch: ${chalk.blue(BRANCH_NAME)}\n`);

  // -------------------------------------------------------------
  // STEP 1: Scan & Detect Vulnerable Dependency
  // -------------------------------------------------------------
  console.log(
    chalk.bgBlue.white.bold(
      ' [STEP 1/5] SCANNING & BUMPING VULNERABLE DEPENDENCY '
    )
  );
  const pkgJsonPath = path.join(TARGET_APP_DIR, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.error(
      chalk.red(`[Error] Target package.json not found at ${pkgJsonPath}`)
    );
    process.exit(1);
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const currentVersion = pkgJson.dependencies?.[TARGET_PACKAGE_NAME] || 'unknown';

  console.log(
    `🔍 Identified dependency: ${chalk.bold(
      TARGET_PACKAGE_NAME
    )} at version ${chalk.red(currentVersion)}`
  );
  console.log(
    `⚠️  Advisory: Vulnerability / Deprecation detected in ${TARGET_PACKAGE_NAME}@${currentVersion}.`
  );
  console.log(
    `🚀 Upgrading ${TARGET_PACKAGE_NAME} to secure target: ${chalk.green(
      TARGET_SECURE_VERSION
    )} (Introducing deliberate BREAKING CHANGE)`
  );

  // Update package.json
  pkgJson.dependencies[TARGET_PACKAGE_NAME] = TARGET_SECURE_VERSION;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
  console.log(chalk.green('✔ Updated package.json. Triggering npm install...'));

  const installResult = await runner.runNpmInstall(TARGET_APP_DIR);
  if (!installResult.success) {
    console.error(
      chalk.red(`[Error] npm install failed: ${installResult.stderr}`)
    );
    process.exit(1);
  }
  console.log(
    chalk.green(
      `✔ npm install completed successfully (${installResult.durationMs}ms).\n`
    )
  );

  // -------------------------------------------------------------
  // STEP 2: Baseline Test Run in Sandbox Container (Expect Failure)
  // -------------------------------------------------------------
  console.log(
    chalk.bgRed.white.bold(
      ' [STEP 2/5] RUNNING SANDBOX TESTS (DETECTING BREAKING CHANGE) '
    )
  );
  console.log(
    `Executing 'npm test' in isolated environment to capture breaking change...`
  );

  let testResult = await runner.runNpmTest(TARGET_APP_DIR);

  if (testResult.success) {
    console.log(
      chalk.green(
        '✔ Tests passed unexpectedly without refactoring! No breaking change encountered.'
      )
    );
  } else {
    console.log(
      chalk.red(
        `✖ Test Suite Failed as expected! (Exit Code: ${testResult.exitCode})`
      )
    );
    console.log(chalk.gray('---------------- Test Error Output ----------------'));
    console.log(
      chalk.yellow(
        (testResult.stderr || testResult.stdout).trim().slice(0, 1000)
      )
    );
    console.log(chalk.gray('---------------------------------------------------\n'));
  }

  // -------------------------------------------------------------
  // STEP 3 & 4: Autonomous Healing Loop (LLM Refactor -> Verify)
  // -------------------------------------------------------------
  console.log(
    chalk.bgMagenta.white.bold(
      ' [STEP 3/5] AUTONOMOUS SELF-HEALING REFACTORING LOOP '
    )
  );

  const targetFilePath = path.join(TARGET_APP_DIR, TARGET_FILE_REL);
  let healingSuccess = false;
  let lastExplanation = '';
  let lastAnalysis = '';
  let attempt = 1;

  while (attempt <= MAX_HEALING_ATTEMPTS && !healingSuccess) {
    console.log(
      chalk.cyan.bold(
        `\n🔄 Loop Iteration ${attempt} of ${MAX_HEALING_ATTEMPTS}: Requesting LLM Patch...`
      )
    );

    const currentFileContent = fs.readFileSync(targetFilePath, 'utf8');

    const remediation = await llm.generatePatch({
      packageName: TARGET_PACKAGE_NAME,
      oldVersion: currentVersion,
      newVersion: TARGET_SECURE_VERSION,
      filePath: TARGET_FILE_REL,
      fileContent: currentFileContent,
      errorStackTrace: testResult.stderr,
      testOutput: testResult.stdout,
      attempt,
      maxAttempts: MAX_HEALING_ATTEMPTS,
    });

    lastExplanation = remediation.explanation;
    lastAnalysis = remediation.breakingChangeAnalysis;

    console.log(chalk.bold('🤖 LLM Root Cause Analysis:'));
    console.log(`   ${chalk.italic(remediation.breakingChangeAnalysis)}`);
    console.log(chalk.bold('💡 Refactoring Strategy:'));
    console.log(`   ${chalk.italic(remediation.explanation)}`);

    console.log(
      chalk.yellow(`📝 Applying generated patch to ${TARGET_FILE_REL}...`)
    );
    fs.writeFileSync(targetFilePath, remediation.patchedCode + '\n', 'utf8');

    console.log(
      `🧪 Re-verifying test suite in sandbox (Attempt ${attempt})...`
    );
    testResult = await runner.runNpmTest(TARGET_APP_DIR);

    if (testResult.success) {
      healingSuccess = true;
      console.log(
        chalk.green.bold(
          `\n✅ TEST PASSED ON ATTEMPT ${attempt}! Autonomous self-healing verified.`
        )
      );
      console.log(chalk.gray(testResult.stdout.trim()));
      break;
    } else {
      console.log(
        chalk.red(
          `✖ Test still failing on attempt ${attempt}. Error stack trace captured for next loop.`
        )
      );
      attempt++;
    }
  }

  if (!healingSuccess) {
    console.error(
      chalk.bgRed.white.bold(
        `\n[FATAL] Autonomous healing failed after ${MAX_HEALING_ATTEMPTS} attempts.`
      )
    );
    console.error(
      'Manual intervention required. Halting pipeline before branch & PR creation.'
    );
    process.exit(1);
  }

  // -------------------------------------------------------------
  // STEP 5: Git Commit & Open Pull Request
  // -------------------------------------------------------------
  console.log(
    chalk.bgGreen.black.bold(
      '\n [STEP 4/5] GIT WORKFLOW & PULL REQUEST CREATION '
    )
  );

  const commitMsg = `fix(deps): bump ${TARGET_PACKAGE_NAME} to ${TARGET_SECURE_VERSION} and adapt call sites`;
  await git.commitChanges(commitMsg, [
    'package.json',
    'package-lock.json',
    TARGET_FILE_REL,
  ]);
  console.log(`✔ Committed remediated files to ${chalk.blue(BRANCH_NAME)}: "${commitMsg}"`);

  console.log(`Opening Pull Request with comprehensive DevSecOps report...`);
  const prResult = await git.createOrSimulatePR({
    packageName: TARGET_PACKAGE_NAME,
    oldVersion: currentVersion,
    newVersion: TARGET_SECURE_VERSION,
    branchName: BRANCH_NAME,
    breakingChangeAnalysis: lastAnalysis,
    explanation: lastExplanation,
    testEvidence: testResult.stdout || '✔ All tests passed',
    remediatedFiles: [TARGET_FILE_REL, 'package.json'],
  });

  // -------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------
  console.log(
    chalk.bgCyan.black.bold('\n [STEP 5/5] REMEDIATION PIPELINE COMPLETE ')
  );
  console.log(chalk.bold('\n📊 Audit Report:'));
  console.log(`   • Target Repository    : ${chalk.yellow(TARGET_APP_DIR)}`);
  console.log(
    `   • Dependency Upgrade   : ${chalk.red(
      TARGET_PACKAGE_NAME + '@' + currentVersion
    )} ➔ ${chalk.green(TARGET_PACKAGE_NAME + '@' + TARGET_SECURE_VERSION)}`
  );
  console.log(
    `   • Healing Loops Taken  : ${chalk.green(
      `${attempt} / ${MAX_HEALING_ATTEMPTS}`
    )}`
  );
  console.log(`   • Git Branch           : ${chalk.blue(BRANCH_NAME)}`);
  console.log(`   • PR Mode              : ${chalk.cyan(prResult.mode)}`);
  console.log(
    `   • Pull Request URL     : ${chalk.bold.green(prResult.pullRequestUrl)}`
  );

  console.log(chalk.bold('\n📄 Remediated Code in ' + TARGET_FILE_REL + ':'));
  console.log(
    chalk.gray(
      '-------------------------------------------------------------------'
    )
  );
  console.log(chalk.white(fs.readFileSync(targetFilePath, 'utf8').trim()));
  console.log(
    chalk.gray(
      '-------------------------------------------------------------------\n'
    )
  );

  if (prResult.diffSummary) {
    console.log(chalk.bold('🔍 Git Diff (against main):'));
    console.log(chalk.gray('-------------------------------------------------------------------'));
    console.log(chalk.yellow(prResult.diffSummary.trim()));
    console.log(chalk.gray('-------------------------------------------------------------------\n'));
  }

  console.log(
    chalk.green.bold(
      '✨ Hefaetus successfully resolved breaking dependency upgrade autonomously!'
    )
  );
}

main().catch((err) => {
  console.error(chalk.red('\n[Unexpected Error in Hefaetus Pipeline]:'), err);
  process.exit(1);
});
