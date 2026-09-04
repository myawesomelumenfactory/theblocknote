import { helpText, parseArgs, runIndexer } from '../services/ImmutableIndexer.js';

const options = parseArgs();

if (options.help) {
  console.log(helpText());
  process.exit(0);
}

try {
  await runIndexer(options);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
