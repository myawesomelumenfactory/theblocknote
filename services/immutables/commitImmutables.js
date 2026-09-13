import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const TRACKED = [
  'data/immutables.json',
  'data/immutables-state.json',
  'public/data/immutables.json',
  'public/data/immutables-state.json',
]

function git(args) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
  })
}

/**
 * When the indexer is caught up, commit the baked immutables snapshot so
 * fresh clients hydrate from an up-to-date lastHeight.
 *
 * Opt out: IMMUTABLES_GIT_COMMIT=0
 * Skip push: IMMUTABLES_GIT_PUSH=0
 */
export function commitImmutablesSnapshot({
  lastHeight = null,
  tip = null,
  count = null,
} = {}) {
  if (process.env.IMMUTABLES_GIT_COMMIT === '0') {
    return { skipped: true, reason: 'IMMUTABLES_GIT_COMMIT=0' }
  }

  const status = git(['status', '--porcelain', '--', ...TRACKED])
  if (status.status !== 0) {
    return {
      skipped: true,
      reason: (status.stderr || status.stdout || 'git status failed').trim(),
    }
  }
  if (!status.stdout.trim()) {
    return { skipped: true, reason: 'immutables snapshot already committed' }
  }

  const add = git(['add', '--', ...TRACKED])
  if (add.status !== 0) {
    return {
      skipped: true,
      reason: (add.stderr || add.stdout || 'git add failed').trim(),
    }
  }

  const heightLabel = Number.isFinite(lastHeight) ? lastHeight : 'tip'
  const tipLabel = Number.isFinite(tip) ? tip : heightLabel
  const countLabel = Number.isFinite(count) ? count : 'updated'
  const message = [
    `Bake immutables through block ${heightLabel} (${countLabel} protocol records).`,
    '',
    `Caught up to tip ${tipLabel} so new clients hydrate from a fresh snapshot.`,
  ].join('\n')

  const commit = git(['commit', '-m', message])
  if (commit.status !== 0) {
    const detail = (commit.stderr || commit.stdout || '').trim()
    if (/nothing to commit/i.test(detail)) {
      return { skipped: true, reason: 'nothing to commit' }
    }
    return { skipped: true, reason: detail || 'git commit failed' }
  }

  const sha = git(['rev-parse', '--short', 'HEAD']).stdout.trim()
  const result = {
    skipped: false,
    committed: true,
    sha,
    pushed: false,
  }

  if (process.env.IMMUTABLES_GIT_PUSH === '0') {
    result.reason = 'IMMUTABLES_GIT_PUSH=0'
    return result
  }

  const push = git(['push'])
  if (push.status !== 0) {
    result.pushError = (push.stderr || push.stdout || 'git push failed').trim()
    return result
  }

  result.pushed = true
  return result
}
