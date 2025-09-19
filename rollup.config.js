import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import dts from 'rollup-plugin-dts';

export default [
  // ESM build (rxjs external)
  {
    input: 'src/index.ts',
    external: ['rxjs', 'rxjs/operators'],
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: false,
    },
    plugins: [
      resolve({ preferBuiltins: false }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
      codecovRollupPlugin({
        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
        bundleName: 'reactive-event-source',
        uploadToken: process.env.CODECOV_TOKEN,
      }),
    ],
  },
  // CommonJS build (rxjs bundled)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: false,
      exports: 'named',
    },
    plugins: [
      resolve({ preferBuiltins: false }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
      codecovRollupPlugin({
        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
        bundleName: 'reactive-event-source',
        uploadToken: process.env.CODECOV_TOKEN,
      }),
    ],
  },
  // UMD build (un-minified, rxjs bundled)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'reactiveEventSource',
      sourcemap: false,
    },
    plugins: [
      resolve({ preferBuiltins: false, browser: true }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
      codecovRollupPlugin({
        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
        bundleName: 'reactive-event-source',
        uploadToken: process.env.CODECOV_TOKEN,
      }),
    ],
  },
  // UMD build (minified, rxjs bundled)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'reactiveEventSource',
      sourcemap: false,
    },
    plugins: [
      resolve({ preferBuiltins: false, browser: true }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
      terser(),
      codecovRollupPlugin({
        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
        bundleName: 'reactive-event-source',
        uploadToken: process.env.CODECOV_TOKEN,
      }),
    ],
  },
  // Type definitions
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
];
