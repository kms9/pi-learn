import { pathToFileURL } from "node:url";

const root = "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules";
const map = {
  typebox: `${root}/typebox/build/index.mjs`,
  "@earendil-works/pi-ai": `${root}/@earendil-works/pi-ai/dist/index.js`,
  "@earendil-works/pi-coding-agent": "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js",
};

export function resolve(specifier, context, nextResolve) {
  if (map[specifier]) return { url: pathToFileURL(map[specifier]).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
