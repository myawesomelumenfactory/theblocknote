import { helpText, parseArgs, runIndexerUntilTip } from '../services/ImmutableIndexer.js';
import { commitImmutablesSnapshot } from '../services/immutables/commitImmutables.js';

const cli = parseArgs();

if (cli.help) {
  console.log(helpText());
  console.log(`This command does not start an HTTP server.
It writes:
  data/immutables.json
  data/immutables-state.json
  public/data/immutables.json
  public/data/immutables-state.json

Default: resume the checkpoint, re-scan the last 8 blocks, then walk to tip.
When caught up, commits those files (set IMMUTABLES_GIT_COMMIT=0 to skip;
IMMUTABLES_GIT_PUSH=0 to commit without pushing).
`);
  process.exit(0);
}

const passedOverlap = process.argv.includes('--overlap');
const options = {
  ...cli,
  resume: cli.resume !== false,
  overlap: passedOverlap ? cli.overlap : 8,
  untilTip: true,
  protocolOnly: cli.protocolOnly !== false,
};

console.log(
  `Indexing without a server (resume ${options.resume}, overlap ${options.overlap}, workers ${options.concurrency})`
);

try {
  const result = await runIndexerUntilTip(options);
  console.log(
    `Wrote ${result.count} messages. lastHeight ${result.lastHeight} / tip ${result.tip}${result.caughtUp ? ' (caught up)' : ''}`
  );

  if (result.caughtUp) {
    const committed = commitImmutablesSnapshot(result);
    if (committed.skipped) {
      console.log(`Immutables git commit skipped: ${committed.reason}`);
    } else {
      console.log(
        `Committed immutables snapshot ${committed.sha}${
          committed.pushed
            ? ' and pushed'
            : committed.pushError
              ? ` (push failed: ${committed.pushError})`
              : ''
        }`
      );
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
