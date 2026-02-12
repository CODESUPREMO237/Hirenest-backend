module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true },
  extends: ['eslint:recommended'],
  ignorePatterns: ['node_modules/', '.next/', 'dist/', 'build/', 'coverage/'],
};
