// echarts' type declarations use `export =` (CJS pattern) even though the
// runtime entry point is proper ESM with named exports. This causes errors
// under moduleResolution: NodeNext. Override the module declaration to
// re-export the same types as proper ESM.
declare module 'echarts' {
  export * from 'echarts/types/dist/echarts';
}
