import ts from "typescript";
import { builtinModules } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, "")),
);
export function violations(source, filename, root) {
  const result = [];
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  function check(value, node) {
    if (!ts.isStringLiteralLike(value)) {
      result.push(
        "Dynamic module paths cannot be checked; use a literal import.",
      );
      return;
    }
    const specifier = value.text;
    const resolved = ts.resolveModuleName(
      specifier,
      filename,
      {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowImportingTsExtensions: true,
      },
      ts.sys,
    ).resolvedModule;
    const target =
      resolved?.resolvedFileName ||
      (specifier.startsWith(".")
        ? resolve(dirname(filename), specifier)
        : undefined);
    const outside =
      target &&
      !target.includes("node_modules/") &&
      (relative(resolve(root, "src"), target).startsWith("..") ||
        target.includes("/server/"));
    const shared = /-types\.ts$/.test(filename);
    const uiDependency =
      shared &&
      (specifier === "react" ||
        specifier.startsWith("react/") ||
        (target && /\/src\/(components|lib)\//.test(target)));
    if (
      specifier.startsWith("node:") ||
      builtins.has(specifier) ||
      outside ||
      uiDependency
    ) {
      const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      result.push(
        `${relative(root, filename)}:${line}: forbidden dependency ${specifier}`,
      );
    }
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      check(node.moduleSpecifier, node);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    )
      check(node.moduleReference.expression, node);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      check(node.argument.literal, node);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      if (node.arguments[0]) check(node.arguments[0], node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}
function scan(directory, root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? scan(path, root)
      : /\.[cm]?[jt]sx?$/.test(path)
        ? violations(readFileSync(path, "utf8"), path, root)
        : [];
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const errors = scan(resolve(root, "src"), root);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Import boundaries passed: browser code stays in src; shared contracts do not depend on UI or browser services.",
    );
}
