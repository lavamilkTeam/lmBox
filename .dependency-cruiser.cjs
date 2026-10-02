const roots = ['features', 'domain', 'platform'];
module.exports = {
  forbidden: [
    { name: 'contracts-independent', severity: 'error', from: { path: '^src/contracts/' }, to: { path: '^src/(app|features|domain|platform|ui)/' } },
    { name: 'contracts-public-entrypoint', severity: 'error', from: { pathNot: '^src/contracts/' }, to: { path: '^src/contracts/', pathNot: '^src/contracts/index\\.ts$' } },
    { name: 'no-unresolved-internal-imports', severity: 'error', from: {}, to: { couldNotResolve: true, path: '^src/|^\\.' } },
    ...roots.flatMap(root => [
      { name: `${root}-public-entrypoints`, severity: 'error', from: { pathNot: `^src/${root}/` }, to: { path: `^src/${root}/[^/]+/(lib|tests)/` } },
      { name: `${root}-private-implementation`, severity: 'error', from: { path: `^src/${root}/([^/]+)/`, pathNot: '/tests/' }, to: { path: `^src/${root}/[^/]+/(lib|tests)/`, pathNot: `^src/${root}/$1/` } },
      { name: `${root}-tests-public-api`, severity: 'error', from: { path: `^src/${root}/([^/]+)/tests/` }, to: { path: `^src/${root}/[^/]+/lib/` } },
    ]),
    { name: 'features-independent', severity: 'error', from: { path: '^src/features/([^/]+)/' }, to: { path: '^src/features/', pathNot: '^src/features/$1/' } },
    { name: 'domain-independent', severity: 'error', from: { path: '^src/domain/' }, to: { path: '^src/(app|features|platform|ui)/' } },
    { name: 'platform-independent', severity: 'error', from: { path: '^src/platform/' }, to: { path: '^src/(app|features|ui)/' } },
    { name: 'ui-independent', severity: 'error', from: { path: '^src/ui/' }, to: { path: '^src/(app|features|domain|platform)/' } },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-test-imports', severity: 'error', from: { pathNot: '/tests/|\\.test\\.ts$' }, to: { path: '/tests/|\\.test\\.ts$' } },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'tsconfig.json' }, enhancedResolveOptions: { extensions: ['.ts', '.js', '.vue', '.json'], conditionNames: ['import','default'] } },
}
