const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

module.exports = function loadTs(relativePath, overrides = {}, extraExports = '', moduleCache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;
  const source = fs.readFileSync(filename, 'utf8') + extraExports;
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  const module = { exports: {} };
  moduleCache.set(filename, module);
  const localRequire = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name.startsWith('.') || name.startsWith('@/')) {
      const resolved = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      if(resolved.endsWith('.json')) return require(path.resolve(root,resolved));
      const dependency = ['.ts', '.tsx'].map(extension => `${resolved}${extension}`).find(file => fs.existsSync(path.resolve(root, file)));
      if (!dependency) throw new Error(`Missing local TypeScript module: ${resolved}`);
      return loadTs(dependency, overrides, '', moduleCache);
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
};
