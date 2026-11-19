// Peers opcionais do better-auth que o Pluton não usa. Sem isto o pnpm os
// resolve a partir do resto do grafo (ex.: o vitest das devDependencies da raiz)
// e o `pnpm deploy --prod` leva vitest/tinypool/mysql2 para a imagem de produção.
const UNUSED_BETTER_AUTH_PEERS = ['vitest', 'mysql2'];

function readPackage(pkg) {
  if (pkg.name === 'better-auth') {
    for (const name of UNUSED_BETTER_AUTH_PEERS) {
      if (pkg.peerDependencies) delete pkg.peerDependencies[name];
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta[name];
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
