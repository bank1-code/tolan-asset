// Consolidate independently executed cases; do not relabel skipped cases as passed.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('qa-results/ui-full-cycle');
const read = name => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const isolated = read('isolated-integration-latest.json');
if (isolated.status !== 'PASS' || !isolated.sourceUnchanged || !isolated.temporarySchemaRemoved)
  throw Error('Isolated QA or source integrity checks did not pass');
const baseline = read('final-automated-tests.json');
const integration = JSON.parse(readFileSync(path.join(isolated.runDirectory, 'vitest-results.json'), 'utf8'));
if (!baseline.success || baseline.numFailedTests || !integration.success || integration.numPassedTests !== 13 || integration.numPendingTests)
  throw Error('Test evidence is incomplete');
const identity = (suite, test) => `${path.relative(process.cwd(), suite.name).replaceAll('\\', '/')}::${test.fullName}`;
const actual = new Map(integration.testResults.flatMap(suite => suite.assertionResults.map(test => [identity(suite, test), test])));
let replaced = 0;
const suites = baseline.testResults.map(suite => ({ ...suite, assertionResults: suite.assertionResults.map(test => {
  const observed = actual.get(identity(suite, test));
  if (!observed) return test;
  if (!['pending','skipped'].includes(test.status) || observed.status !== 'passed') throw Error('Unexpected consolidation status');
  replaced++; return { ...observed, evidenceRun: path.relative(root, isolated.runDirectory).replaceAll('\\', '/') };
}) }));
if (replaced !== 13 || actual.size !== 13) throw Error('Case identities must match all 13 previously skipped tests');
const cases = suites.flatMap(suite => suite.assertionResults);
const combined = {
  ...baseline,
  generatedAt: new Date().toISOString(),
  evidenceType: 'CONSOLIDATED_DISTINCT_CASES_FROM_TWO_RUNS',
  sources: ['final-automated-tests.json', path.relative(root, path.join(isolated.runDirectory, 'vitest-results.json')).replaceAll('\\', '/')],
  numTotalTests: cases.length,
  numPassedTests: cases.filter(test => test.status === 'passed').length,
  numFailedTests: cases.filter(test => test.status === 'failed').length,
  numPendingTests: cases.filter(test => ['pending','skipped'].includes(test.status)).length,
  testResults: suites,
};
combined.success = combined.numPassedTests === 392 && combined.numFailedTests === 0 && combined.numPendingTests === 0;
if (!combined.success) throw Error('Expected 392 distinct passed cases');
writeFileSync(path.join(root, 'combined-automated-tests.json'), JSON.stringify(combined, null, 2));
console.log(JSON.stringify({ total: combined.numTotalTests, passed: combined.numPassedTests, failed: combined.numFailedTests, skipped: combined.numPendingTests, separateEvidenceRuns: 2 }));
