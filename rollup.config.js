import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import dts from 'rollup-plugin-dts';

const input = 'src/index.ts';

// rxjs is a dependency, so ESM and CJS consumers resolve it themselves and share one copy with the app.
// Only the UMD bundles inline it, because CDN users have no package manager to provide it.
const isExternal = (id) => id === 'rxjs' || id.startsWith('rxjs/');

/**
 * @param {{ browser?: boolean, minify?: boolean, bundleName: string }} opts
 */
const plugins = ({ browser = false, minify = false, bundleName }) => [
  resolve({ preferBuiltins: false, browser }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false,
  }),
  ...(minify ? [terser()] : []),
  codecovRollupPlugin({
    enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
    bundleName,
    uploadToken: process.env.CODECOV_TOKEN,
  }),
];

export default [
  // ESM build (rxjs external)
  {
    input,
    external: isExternal,
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: false,
    },
    plugins: plugins({ bundleName: 'reactive-event-source' }),
  },
  // CommonJS build (rxjs external). The .cjs extension is required because package.json sets "type": "module".
  {
    input,
    external: isExternal,
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: false,
      exports: 'named',
    },
    plugins: plugins({ bundleName: 'reactive-event-source-cjs' }),
  },
  // UMD build (un-minified, rxjs bundled)
  {
    input,
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'reactiveEventSource',
      sourcemap: false,
    },
    plugins: plugins({ browser: true, bundleName: 'reactive-event-source-umd' }),
  },
  // UMD build (minified, rxjs bundled)
  {
    input,
    output: {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'reactiveEventSource',
      sourcemap: false,
    },
    plugins: plugins({ browser: true, minify: true, bundleName: 'reactive-event-source-umd-min' }),
  },
  // Type definitions, once for ESM (.d.ts) and once for CJS (.d.cts) so each resolution mode gets matching types
  {
    input,
    external: isExternal,
    output: [
      { file: 'dist/index.d.ts', format: 'es' },
      { file: 'dist/index.d.cts', format: 'es' },
    ],
    plugins: [dts()],
  },
];
