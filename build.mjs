import * as esbuild from 'esbuild';
import { promises as fs } from 'fs';

fs.readdir('bundles').then(async (files) => {
  const entryPoints = files
    .filter((file) => file.endsWith('.ts') || file.endsWith('.mjs'))
    .map((file) => `bundles/${file}`);
  const esbuildArgs = {
    entryPoints,
    bundle: true,
    outdir: 'fdist',
    format: 'esm',
    minify: true,
    sourcemap: true,
  };

  // If args has --watch then watch, else just build
  if (process.argv.includes('--watch')) {
    const context = await esbuild.context(esbuildArgs);
    await context.watch();
  }
  else {
    const result = await esbuild.build(esbuildArgs);
    if (result.errors.length > 0) {
      console.error(result.errors);
      process.exit(1);
    }
  }
});