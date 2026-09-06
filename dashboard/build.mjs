// Bundle the browser app (web/) into public/bundle.js with esbuild.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["web/main.tsx"],
  bundle: true,
  outfile: "public/bundle.js",
  format: "esm",
  target: ["es2022"],
  jsx: "automatic",
  tsconfig: "web/tsconfig.json",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
