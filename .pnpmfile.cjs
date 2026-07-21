function readPackage(pkg, context) {
  // Remove jsdom from vitest's optional peer dependencies since happy-dom is used
  if (pkg.name === 'vitest') {
    if (pkg.peerDependencies && pkg.peerDependencies.jsdom) {
      delete pkg.peerDependencies.jsdom;
    }
    if (pkg.peerDependenciesMeta && pkg.peerDependenciesMeta.jsdom) {
      delete pkg.peerDependenciesMeta.jsdom;
    }
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
