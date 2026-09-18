import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { SandboxRunner } from './runner';
import { RemediationLLMClient } from './llm';
import { GitManager, PackageBumpInfo } from './git';

// Load environment variables from .env in hefaetus-poc or current directory
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
const BRANCH_NAME = 'fix/hefaetus-autonomous-dependency-remediation';
const MAX_HEALING_ATTEMPTS = 6;

interface TargetPackageDef {
  name: string;
  targetVersion: string;
  sourceFile: string;
}

const TARGET_PACKAGES: TargetPackageDef[] = [
  {
    name: 'uuid',
    targetVersion: '^9.0.0',
    sourceFile: path.join('src', 'idGenerator.js'),
  },
  {
    name: 'glob',
    targetVersion: '^10.3.10',
    sourceFile: path.join('src', 'fileFinder.js'),
  },
  {
    name: 'rimraf',
    targetVersion: '^5.0.5',
    sourceFile: path.join('src', 'fileCleaner.js'),
  },
];

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
  // STEP 1: Scan & Detect Vulnerable Dependencies
  // -------------------------------------------------------------
  console.log(
    chalk.bgBlue.white.bold(
      ' [STEP 1/5] SCANNING & BUMPING VULNERABLE DEPENDENCIES '
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
  pkgJson.dependencies = pkgJson.dependencies || {};

  const packageBumps: PackageBumpInfo[] = [];

  console.log(chalk.bold('🔍 Scanning target manifest for deprecated/vulnerable packages...'));
  for (const targetPkg of TARGET_PACKAGES) {
    const currentVersion = pkgJson.dependencies[targetPkg.name] || 'unknown';
    packageBumps.push({
      name: targetPkg.name,
      oldVersion: currentVersion,
      newVersion: targetPkg.targetVersion,
    });
    console.log(
      `   • ${chalk.bold(targetPkg.name)}: ${chalk.red(currentVersion)} ➔ ${chalk.green(
        targetPkg.targetVersion
      )} (introducing deliberate breaking change)`
    );
    pkgJson.dependencies[targetPkg.name] = targetPkg.targetVersion;
  }

  // Update package.json
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
      ' [STEP 2/5] RUNNING SANDBOX TESTS (DETECTING BREAKING CHANGES) '
    )
  );
  console.log(
    `Executing 'npm test' in isolated environment to capture breaking changes...`
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
  // STEP 3: Autonomous Healing Loop (LLM Refactor -> Verify)
  // -------------------------------------------------------------
  console.log(
    chalk.bgMagenta.white.bold(
      ' [STEP 3/5] AUTONOMOUS SELF-HEALING REFACTORING LOOP '
    )
  );

  let healingSuccess = testResult.success;
  const analyses: string[] = [];
  const explanations: string[] = [];
  const healedFiles = new Set<string>();
  let attempt = 1;

  while (attempt <= MAX_HEALING_ATTEMPTS && !healingSuccess) {
    console.log(
      chalk.cyan.bold(
        `\n🔄 Loop Iteration ${attempt} of ${MAX_HEALING_ATTEMPTS}: Inspecting Failure & Requesting LLM Patch...`
      )
    );

    const combinedOutput = `${testResult.stderr}\n${testResult.stdout}`;

    // Identify which package / source file caused the failure
    let failingTarget = TARGET_PACKAGES.find((pkg) => {
      const baseName = path.basename(pkg.sourceFile);
      return combinedOutput.includes(baseName) || combinedOutput.includes(pkg.name);
    });

    // Fallback: pick the first unhealed file
    if (!failingTarget) {
      failingTarget = TARGET_PACKAGES.find((pkg) => !healedFiles.has(pkg.sourceFile)) || TARGET_PACKAGES[0];
    }

    const currentBump = packageBumps.find((p) => p.name === failingTarget!.name);
    const targetFilePath = path.join(TARGET_APP_DIR, failingTarget.sourceFile);
    const currentFileContent = fs.readFileSync(targetFilePath, 'utf8');

    console.log(
      chalk.yellow(
        `🎯 Target identified: Package "${chalk.bold(failingTarget.name)}" -> File "${chalk.bold(
          failingTarget.sourceFile
        )}"`
      )
    );

    const remediation = await llm.generatePatch({
      packageName: failingTarget.name,
      oldVersion: currentBump?.oldVersion || 'unknown',
      newVersion: failingTarget.targetVersion,
      filePath: failingTarget.sourceFile,
      fileContent: currentFileContent,
      errorStackTrace: testResult.stderr || testResult.stdout,
      testOutput: testResult.stdout,
      attempt,
      maxAttempts: MAX_HEALING_ATTEMPTS,
    });

    analyses.push(`- **\`${failingTarget.name}\`**: ${remediation.breakingChangeAnalysis}`);
    explanations.push(`- **\`${failingTarget.sourceFile}\`**: ${remediation.explanation}`);
    healedFiles.add(failingTarget.sourceFile);

    console.log(chalk.bold('🤖 LLM Root Cause Analysis:'));
    console.log(`   ${chalk.italic(remediation.breakingChangeAnalysis)}`);
    console.log(chalk.bold('💡 Refactoring Strategy:'));
    console.log(`   ${chalk.italic(remediation.explanation)}`);

    console.log(
      chalk.yellow(`📝 Applying generated patch to ${failingTarget.sourceFile}...`)
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
          `\n✅ ALL TESTS PASSED ON ATTEMPT ${attempt}! Autonomous self-healing verified across upgraded packages.`
        )
      );
      console.log(chalk.gray(testResult.stdout.trim()));
      break;
    } else {
      console.log(
        chalk.red(
          `✖ Test suite still has failing tests on attempt ${attempt}. Capturing next error trace...`
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
  // STEP 4: Git Commit & Open Pull Request
  // -------------------------------------------------------------
  console.log(
    chalk.bgGreen.black.bold(
      '\n [STEP 4/5] GIT WORKFLOW & PULL REQUEST CREATION '
    )
  );

  const commitMsg = `fix(deps): bump dependencies and remediate breaking changes [${TARGET_PACKAGES.map(
    (p) => p.name
  ).join(', ')}]`;
  const filesToCommit = [
    'package.json',
    'package-lock.json',
    ...TARGET_PACKAGES.map((p) => p.sourceFile),
  ];

  await git.commitChanges(commitMsg, filesToCommit);
  console.log(
    `✔ Committed remediated files to ${chalk.blue(BRANCH_NAME)}: "${commitMsg}"`
  );

  console.log(`Opening Pull Request with comprehensive DevSecOps report...`);
  const prResult = await git.createOrSimulatePR({
    packages: packageBumps,
    branchName: BRANCH_NAME,
    breakingChangeAnalysis: analyses.join('\n\n'),
    explanation: explanations.join('\n\n'),
    testEvidence: testResult.stdout || '✔ All tests passed',
    remediatedFiles: Array.from(healedFiles),
  });

  // -------------------------------------------------------------
  // STEP 5: Remediation Pipeline Complete Summary
  // -------------------------------------------------------------
  console.log(
    chalk.bgCyan.black.bold('\n [STEP 5/5] REMEDIATION PIPELINE COMPLETE ')
  );
  console.log(chalk.bold('\n📊 Audit Report:'));
  console.log(`   • Target Repository    : ${chalk.yellow(TARGET_APP_DIR)}`);
  console.log(`   • Dependencies Remediated:`);
  for (const b of packageBumps) {
    console.log(
      `     - ${chalk.bold(b.name)}: ${chalk.red(b.oldVersion)} ➔ ${chalk.green(
        b.newVersion
      )}`
    );
  }
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

  console.log(chalk.bold('\n📄 Remediated Source Files:'));
  for (const relFile of TARGET_PACKAGES.map((p) => p.sourceFile)) {
    const fullPath = path.join(TARGET_APP_DIR, relFile);
    console.log(chalk.cyan(`\n--- ${relFile} ---`));
    console.log(chalk.white(fs.readFileSync(fullPath, 'utf8').trim()));
  }

  if (prResult.diffSummary) {
    console.log(chalk.bold('\n🔍 Git Diff (against main):'));
    console.log(
      chalk.gray(
        '-------------------------------------------------------------------'
      )
    );
    console.log(chalk.yellow(prResult.diffSummary.trim()));
    console.log(
      chalk.gray(
        '-------------------------------------------------------------------\n'
      )
    );
  }

  console.log(
    chalk.green.bold(
      '✨ Hefaetus successfully resolved all breaking dependency upgrades autonomously!'
    )
  );
}

main().catch((err) => {
  console.error(chalk.red('\n[Unexpected Error in Hefaetus Pipeline]:'), err);
  process.exit(1);
});
