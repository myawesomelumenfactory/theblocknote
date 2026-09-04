import { helpText, parseArgs, runIndexer, runIndexerUntilTip } from '../services/ImmutableIndexer.js';

const options = parseArgs();

if (options.help) {
  console.log(helpText());
  process.exit(0);
}

try {
  if (options.untilTip) {
    await runIndexerUntilTip(options);
  } else {
    await runIndexer(options);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
