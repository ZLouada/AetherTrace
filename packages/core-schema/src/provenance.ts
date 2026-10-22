import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';

// --- Type Definitions ---

export type ReproducibilityStatus =
  | 'reproducible'
  | 'reproducible_with_warnings'
  | 'source_changed'
  | 'dependencies_changed'
  | 'environment_changed'
  | 'dirty_worktree'
  | 'incomplete'
  | 'unknown';

export interface GitProvenance {
  repository_root?: string;
  commit_sha?: string;
  short_sha?: string;
  branch?: string | null;
  dirty: boolean;
  detached_head: boolean;
  git_version?: string;
  source_fingerprint?: string;
}

export interface EnvironmentProvenance {
  os: string;
  architecture: string;
  runtime: {
    name: string;
    version: string;
  };
  aethertrace_version?: string;
  sdk_version?: string;
  cli_version?: string;
  package_manager?: string;
}

export interface DependencyProvenance {
  lockfile_type:
    | 'pnpm-lock.yaml'
    | 'package-lock.json'
    | 'yarn.lock'
    | 'bun.lockb'
    | 'poetry.lock'
    | 'Pipfile.lock'
    | 'requirements.txt'
    | 'unknown'
    | 'none';
  lockfile_fingerprint?: string;
  lockfile_path?: string;
}

export interface RunProvenance {
  git?: GitProvenance | null;
  environment?: EnvironmentProvenance | null;
  dependencies?: DependencyProvenance | null;
  reproducibility?: {
    status: ReproducibilityStatus;
    reasons?: string[];
  };
  captured_at?: number;
}

export interface ReproducibilityScorecard {
  source: boolean;
  dependencies: boolean;
  runtime: boolean;
  platform: boolean;
  git_state: boolean;
  status: ReproducibilityStatus;
  interpretation: string;
}

export interface ProvenanceComparisonResult {
  source: {
    same_commit: boolean;
    base_commit: string | null;
    target_commit: string | null;
    base_dirty: boolean;
    target_dirty: boolean;
    same_fingerprint: boolean;
    status: 'identical' | 'changed' | 'dirty_divergence' | 'unknown';
  };
  dependencies: {
    same_lockfile: boolean;
    base_lockfile: string | null;
    target_lockfile: string | null;
    same_fingerprint: boolean;
    status: 'identical' | 'changed' | 'unknown';
  };
  runtime: {
    same_runtime: boolean;
    same_version: boolean;
    base_runtime: string | null;
    target_runtime: string | null;
    status: 'identical' | 'changed' | 'unknown';
  };
  platform: {
    same_os: boolean;
    same_arch: boolean;
    base_platform: string | null;
    target_platform: string | null;
    status: 'identical' | 'changed' | 'unknown';
  };
  scorecard: ReproducibilityScorecard;
}

// --- Secret Exclusion & Safety Denylist ---

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /auth/i,
  /credential/i,
  /bearer/i,
  /cookie/i,
  /database[_-]?url/i,
  /private[_-]?key/i,
  /\.env(\..+)?$/i,
  /\.(pem|key|pfx|pkcs12)$/i,
  /id_rsa/i
];

export function isSecretKeyOrPath(name: string): boolean {
  if (!name) return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

// --- Git Provenance Capture ---

let cachedGitVersion: string | undefined = undefined;

function runGit(args: string, cwd: string): string | null {
  try {
    const output = execSync(`git ${args}`, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
      encoding: 'utf-8'
    });
    return output.trim();
  } catch {
    return null;
  }
}

export function findGitRoot(startDir: string = process.cwd()): string | null {
  const root = runGit('rev-parse --show-toplevel', startDir);
  return root && root.length > 0 ? root : null;
}

export function computeSourceFingerprint(repoDir: string, commitSha: string, isDirty: boolean): string {
  const hasher = createHash('sha256');
  hasher.update(`commit:${commitSha}\n`);

  if (!isDirty) {
    hasher.update('clean\n');
    return hasher.digest('hex');
  }

  // When dirty, hash the list of changed files and clean diff (excluding secrets and ignored files)
  const statusOutput = runGit('status --porcelain -u', repoDir) || '';
  const lines = statusOutput.split('\n').filter(Boolean);

  // Filter out any secret paths or ignored candidates
  const safeLines: string[] = [];
  for (const line of lines) {
    const filePath = line.slice(3).trim();
    if (!isSecretKeyOrPath(filePath) && !filePath.includes('.trace.sqlite')) {
      safeLines.push(line);
    }
  }

  safeLines.sort();
  hasher.update(`dirty_status:${safeLines.join('\n')}\n`);

  // Include tracked diff if small enough
  const trackedDiff = runGit('diff -U1 HEAD', repoDir);
  if (trackedDiff) {
    // Sanitize diff to exclude any potential accidental env lines
    const diffLines = trackedDiff.split('\n').filter((l) => !isSecretKeyOrPath(l));
    hasher.update(diffLines.slice(0, 500).join('\n'));
  }

  return hasher.digest('hex');
}

export function captureGitProvenance(repoDir: string = process.cwd()): GitProvenance | null {
  // Use a combined rev-parse call to retrieve root, commit sha, and branch in a single git execution
  const revParseOut = runGit('rev-parse --show-toplevel HEAD --abbrev-ref HEAD', repoDir);
  if (!revParseOut) {
    return null;
  }

  const parts = revParseOut.split('\n').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const repository_root = parts[0];
  const commit_sha = parts[1];
  const rawBranch = parts[2] || '';
  const detached_head = !rawBranch || rawBranch === 'HEAD';
  const branch = detached_head ? null : rawBranch;

  const short_sha = commit_sha.slice(0, 7);

  if (!cachedGitVersion) {
    cachedGitVersion = runGit('--version', repository_root) || undefined;
  }
  const git_version = cachedGitVersion;

  // Check dirty status (ignore untracked .trace.sqlite files)
  const porcelain = runGit('status --porcelain', repository_root) || '';
  const meaningfulChanges = porcelain
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.includes('.trace.sqlite') && !l.includes('screenshots/'));

  const dirty = meaningfulChanges.length > 0;
  const source_fingerprint = computeSourceFingerprint(repository_root, commit_sha, dirty);

  return {
    repository_root,
    commit_sha,
    short_sha,
    branch,
    dirty,
    detached_head,
    git_version,
    source_fingerprint
  };
}

// --- Environment Provenance Capture ---

export function captureEnvironmentProvenance(): EnvironmentProvenance {
  return {
    os: process.platform,
    architecture: process.arch,
    runtime: {
      name: 'node',
      version: process.version
    },
    aethertrace_version: '0.4.0',
    package_manager: detectPackageManager()
  };
}

function detectPackageManager(cwd: string = process.cwd()): string {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun';
  if (existsSync(join(cwd, 'poetry.lock'))) return 'poetry';
  if (existsSync(join(cwd, 'Pipfile.lock'))) return 'pipenv';
  if (existsSync(join(cwd, 'requirements.txt'))) return 'pip';

  if (process.env.npm_config_user_agent) {
    const pm = process.env.npm_config_user_agent.split('/')[0];
    if (pm) return pm;
  }
  return 'unknown';
}

// --- Dependency Provenance Capture ---

const LOCKFILE_CANDIDATES: Array<{
  name: DependencyProvenance['lockfile_type'];
  file: string;
}> = [
  { name: 'pnpm-lock.yaml', file: 'pnpm-lock.yaml' },
  { name: 'package-lock.json', file: 'package-lock.json' },
  { name: 'yarn.lock', file: 'yarn.lock' },
  { name: 'bun.lockb', file: 'bun.lockb' },
  { name: 'poetry.lock', file: 'poetry.lock' },
  { name: 'Pipfile.lock', file: 'Pipfile.lock' },
  { name: 'requirements.txt', file: 'requirements.txt' }
];

const lockfileFingerprintCache = new Map<string, { mtimeMs: number; fingerprint: string }>();

export function captureDependencyProvenance(rootDir: string = process.cwd()): DependencyProvenance {
  for (const candidate of LOCKFILE_CANDIDATES) {
    const lockPath = join(rootDir, candidate.file);
    if (existsSync(lockPath)) {
      try {
        const stats = statSync(lockPath);
        const cached = lockfileFingerprintCache.get(lockPath);
        if (cached && cached.mtimeMs === stats.mtimeMs) {
          return {
            lockfile_type: candidate.name,
            lockfile_fingerprint: cached.fingerprint,
            lockfile_path: candidate.file
          };
        }
        const content = readFileSync(lockPath);
        const fingerprint = createHash('sha256').update(content).digest('hex');
        lockfileFingerprintCache.set(lockPath, { mtimeMs: stats.mtimeMs, fingerprint });
        return {
          lockfile_type: candidate.name,
          lockfile_fingerprint: fingerprint,
          lockfile_path: candidate.file
        };
      } catch {
        // Continue searching
      }
    }
  }

  return {
    lockfile_type: 'none'
  };
}

// --- Full Provenance Capture ---

export interface CaptureProvenanceOptions {
  repoDir?: string;
  forceFresh?: boolean;
}

interface ProvCacheEntry {
  timestamp: number;
  data: RunProvenance;
}

const provenanceCache = new Map<string, ProvCacheEntry>();
const PROVENANCE_CACHE_TTL_MS = 2500;

export function captureFullProvenance(options: CaptureProvenanceOptions = {}): RunProvenance {
  const dir = options.repoDir || process.cwd();

  if (!options.forceFresh) {
    const cached = provenanceCache.get(dir);
    if (cached && Date.now() - cached.timestamp < PROVENANCE_CACHE_TTL_MS) {
      return {
        ...cached.data,
        captured_at: Date.now()
      };
    }
  }

  const git = captureGitProvenance(dir);
  const environment = captureEnvironmentProvenance();
  const dependencies = captureDependencyProvenance(dir);

  const reasons: string[] = [];
  let status: ReproducibilityStatus = 'reproducible';

  if (!git) {
    status = 'incomplete';
    reasons.push('Execution occurred outside a detected Git repository.');
  } else if (git.dirty) {
    status = 'dirty_worktree';
    reasons.push('Working tree had uncommitted modifications at execution time.');
  } else if (git.detached_head) {
    status = 'reproducible_with_warnings';
    reasons.push('Execution occurred on a detached HEAD state.');
  }

  const result: RunProvenance = {
    git,
    environment,
    dependencies,
    reproducibility: {
      status,
      reasons
    },
    captured_at: Date.now()
  };

  provenanceCache.set(dir, { timestamp: Date.now(), data: result });
  return result;
}

// --- Provenance Comparison & Reproducibility Assessment ---

export function compareRunProvenance(
  baseProv: RunProvenance | null | undefined,
  targetProv: RunProvenance | null | undefined
): ProvenanceComparisonResult {
  const baseGit = baseProv?.git;
  const targetGit = targetProv?.git;

  const baseDeps = baseProv?.dependencies;
  const targetDeps = targetProv?.dependencies;

  const baseEnv = baseProv?.environment;
  const targetEnv = targetProv?.environment;

  // Source comparison
  const hasGit = Boolean(baseGit?.commit_sha && targetGit?.commit_sha);
  const same_commit = hasGit ? baseGit!.commit_sha === targetGit!.commit_sha : false;
  const same_fingerprint = Boolean(
    baseGit?.source_fingerprint &&
    targetGit?.source_fingerprint &&
    baseGit.source_fingerprint === targetGit.source_fingerprint
  );
  const base_dirty = Boolean(baseGit?.dirty);
  const target_dirty = Boolean(targetGit?.dirty);

  let source_status: 'identical' | 'changed' | 'dirty_divergence' | 'unknown' = 'unknown';
  if (!hasGit) {
    source_status = 'unknown';
  } else if (same_commit && !base_dirty && !target_dirty) {
    source_status = 'identical';
  } else if (same_commit && (base_dirty || target_dirty)) {
    source_status = same_fingerprint ? 'identical' : 'dirty_divergence';
  } else {
    source_status = 'changed';
  }

  // Dependency comparison
  const hasDeps = Boolean(baseDeps?.lockfile_fingerprint && targetDeps?.lockfile_fingerprint);
  const same_lockfile = Boolean(baseDeps?.lockfile_type && targetDeps?.lockfile_type && baseDeps.lockfile_type === targetDeps.lockfile_type);
  const same_dep_fingerprint = hasDeps ? baseDeps!.lockfile_fingerprint === targetDeps!.lockfile_fingerprint : false;
  let dep_status: 'identical' | 'changed' | 'unknown' = 'unknown';
  if (!baseDeps || !targetDeps || baseDeps.lockfile_type === 'none' || targetDeps.lockfile_type === 'none') {
    dep_status = 'unknown';
  } else if (same_lockfile && same_dep_fingerprint) {
    dep_status = 'identical';
  } else {
    dep_status = 'changed';
  }

  // Runtime comparison
  const hasRuntime = Boolean(baseEnv?.runtime?.version && targetEnv?.runtime?.version);
  const same_runtime_name = baseEnv?.runtime?.name === targetEnv?.runtime?.name;
  const same_version = hasRuntime && baseEnv!.runtime.version === targetEnv!.runtime.version;
  let runtime_status: 'identical' | 'changed' | 'unknown' = 'unknown';
  if (!hasRuntime) {
    runtime_status = 'unknown';
  } else if (same_runtime_name && same_version) {
    runtime_status = 'identical';
  } else {
    runtime_status = 'changed';
  }

  // Platform comparison
  const hasPlatform = Boolean(baseEnv?.os && targetEnv?.os);
  const same_os = hasPlatform && baseEnv!.os === targetEnv!.os;
  const same_arch = hasPlatform && baseEnv!.architecture === targetEnv!.architecture;
  let platform_status: 'identical' | 'changed' | 'unknown' = 'unknown';
  if (!hasPlatform) {
    platform_status = 'unknown';
  } else if (same_os && same_arch) {
    platform_status = 'identical';
  } else {
    platform_status = 'changed';
  }

  // Overall Scorecard & Interpretation
  const sourceMatches = source_status === 'identical';
  const depsMatch = dep_status === 'identical';
  const runtimeMatches = runtime_status === 'identical';
  const platformMatches = platform_status === 'identical';
  const gitStateMatches = (!base_dirty && !target_dirty);

  let overallStatus: ReproducibilityStatus = 'reproducible';
  let interpretation = 'Identical source, dependencies, and environment.';

  if (!baseProv || !targetProv || !hasGit) {
    overallStatus = 'incomplete';
    interpretation = 'Provenance metadata unavailable for one or both runs.';
  } else if (source_status === 'dirty_divergence' || base_dirty || target_dirty) {
    overallStatus = 'dirty_worktree';
    interpretation = 'One or both runs executed with uncommitted source modifications.';
  } else if (!sourceMatches) {
    overallStatus = 'source_changed';
    interpretation = `Source code differs (${baseGit?.short_sha || 'base'} ➔ ${targetGit?.short_sha || 'target'}).`;
  } else if (!depsMatch) {
    overallStatus = 'dependencies_changed';
    interpretation = 'Dependency lockfile fingerprint changed between runs.';
  } else if (!runtimeMatches || !platformMatches) {
    overallStatus = 'environment_changed';
    interpretation = 'Execution environment (runtime or OS/architecture) differs.';
  } else {
    overallStatus = 'reproducible';
    interpretation = 'Execution changed while source remained identical.';
  }

  return {
    source: {
      same_commit,
      base_commit: baseGit?.commit_sha || null,
      target_commit: targetGit?.commit_sha || null,
      base_dirty,
      target_dirty,
      same_fingerprint,
      status: source_status
    },
    dependencies: {
      same_lockfile,
      base_lockfile: baseDeps?.lockfile_type || null,
      target_lockfile: targetDeps?.lockfile_type || null,
      same_fingerprint: same_dep_fingerprint,
      status: dep_status
    },
    runtime: {
      same_runtime: same_runtime_name,
      same_version,
      base_runtime: baseEnv?.runtime ? `${baseEnv.runtime.name} ${baseEnv.runtime.version}` : null,
      target_runtime: targetEnv?.runtime ? `${targetEnv.runtime.name} ${targetEnv.runtime.version}` : null,
      status: runtime_status
    },
    platform: {
      same_os,
      same_arch,
      base_platform: baseEnv ? `${baseEnv.os}-${baseEnv.architecture}` : null,
      target_platform: targetEnv ? `${targetEnv.os}-${targetEnv.architecture}` : null,
      status: platform_status
    },
    scorecard: {
      source: sourceMatches,
      dependencies: depsMatch,
      runtime: runtimeMatches,
      platform: platformMatches,
      git_state: gitStateMatches,
      status: overallStatus,
      interpretation
    }
  };
}
