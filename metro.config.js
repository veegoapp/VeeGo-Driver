const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.unstable_enableSymlinks = true;

config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/drizzle-kit\/.*/,
  /node_modules\/.pnpm\/drizzle-kit.*\/node_modules\/drizzle-kit\/node_modules\/.*/,
];

module.exports = config;
