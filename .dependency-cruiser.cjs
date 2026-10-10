const { readdirSync } = require('node:fs');
const moduleRoots = readdirSync('frontend/modules', { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => ({ name: entry.name, root: `frontend/modules/${entry.name}/lib` }));
const rule = (name, from, to) => ({ name, severity: 'error', from, to });
const publicEntries = (root, label) => [
  rule(`${label}-public-entrypoints`, { pathNot: `^${root}/` }, { path: `^${root}/[^/]+/(lib|tests)/` }),
  rule(`${label}-private-implementation`, { path: `^${root}/([^/]+)/`, pathNot: '/tests/' }, { path: `^${root}/[^/]+/(lib|tests)/`, pathNot: `^${root}/$1/` }),
  rule(`${label}-tests-public-api`, { path: `^${root}/([^/]+)/tests/` }, { path: `^${root}/[^/]+/lib/` }),
];
module.exports = {
  forbidden: [
    rule('tauri-only-in-desktop-platform', { pathNot: '^frontend/platform/desktop/' }, { path: '(^|/)@tauri-apps/' }),
    rule('contracts-independent', { path: '^frontend/contracts/' }, { path: '^frontend/(app|modules|platform|ui)/' }),
    rule('contracts-public-entrypoint', { pathNot: '^frontend/contracts/' }, { path: '^frontend/contracts/', pathNot: '^frontend/contracts/index\\.ts$' }),
    rule('no-unresolved-internal-imports', {}, { couldNotResolve: true, path: '^frontend/|^\\.' }),
    rule('modules-public-entrypoints', { pathNot: '^frontend/modules/' }, { path: '^frontend/modules/[^/]+/(lib|tests)/' }),
    rule('modules-independent', { path: '^frontend/modules/([^/]+)/' }, { path: '^frontend/modules/', pathNot: '^frontend/modules/$1/' }),
    rule('modules-cannot-import-shell', { path: '^frontend/modules/' }, { path: '^frontend/app/' }),
    rule('platform-independent', { path: '^frontend/platform/' }, { path: '^frontend/(app|modules|ui)/' }),
    rule('ui-independent', { path: '^frontend/ui/' }, { path: '^frontend/(app|modules|platform|contracts)/' }),
    ...['platform', 'ui'].flatMap(root => publicEntries(`frontend/${root}`, root)),
    ...moduleRoots.flatMap(({ name, root }) => [
      ...['features', 'domain'].flatMap(layer => publicEntries(`${root}/${layer}`, `${name}-${layer}`)),
      rule(`${name}-features-independent`, { path: `^${root}/features/([^/]+)/` }, { path: `^${root}/features/`, pathNot: `^${root}/features/$1/` }),
      rule(`${name}-features-cannot-import-app`, { path: `^${root}/features/` }, { path: `^${root}/app/` }),
      rule(`${name}-domain-independent`, { path: `^${root}/domain/` }, { path: `^${root}/(app|features|ui)/|^frontend/(platform|ui|app)/` }),
      rule(`${name}-ui-independent`, { path: `^${root}/ui/` }, { path: `^${root}/(app|features|domain)/|^frontend/(platform|app|contracts)/` }),
    ]),
    rule('no-circular', {}, { circular: true }),
    rule('no-test-imports', { pathNot: '/tests/|\\.test\\.ts$' }, { path: '/tests/|\\.test\\.ts$' }),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.vue', '.json'], conditionNames: ['import', 'default'] },
  },
};
