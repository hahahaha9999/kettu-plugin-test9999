import { readFile, writeFile, readdir } from "fs/promises";
import { extname } from "path";

import { rollup } from "rollup";
import url from "@rollup/plugin-url";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

const plugins = [
    nodeResolve(),
    commonjs(),
    url({
        include: ["**/*.svg", "**/*.png", "**/*.jpg", "**/*.gif"],
        limit: 0,
    }),
    {
        name: "swc",
        async transform(code, id) {
            const ext = extname(id);
            if (!extensions.includes(ext)) return null;

            const ts = ext.includes("ts");
            const tsx = ts ? ext.endsWith("x") : undefined;
            const jsx = !ts ? ext.endsWith("x") : undefined;

            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    externalHelpers: true,
                    parser: {
                        syntax: ts ? "typescript" : "ecmascript",
                        tsx,
                        jsx,
                    },
                },
                env: {
                    targets: "defaults",
                    include: [
                        "transform-classes",
                        "transform-arrow-functions",
                    ],
                },
            });

            return result.code;
        },
    },
    esbuild({ minify: true }),
];

for (const plug of await readdir("./plugins")) {
    const manifest = JSON.parse(
        await readFile(`./plugins/${plug}/manifest.json`)
    );

    const outDir = `./dist/${plug}`;
    const outPath = `${outDir}/index.js`;

    try {
        await import("fs/promises").then(fs =>
            fs.mkdir(outDir, { recursive: true })
        );

        const bundle = await rollup({
            input: `./plugins/${plug}/${manifest.main}`,
            onwarn: () => {},
            plugins,
        });

        await bundle.write({
            file: outPath,
            globals(id) {
                if (id.startsWith("@vendetta"))
                    return id.substring(1).replace(/\//g, ".");

                if (id === "react")
                    return "window.React";

                return null;
            },
            format: "es",
            compact: true,
        });

        await bundle.close();

        // Keep manifest simple for testing
        delete manifest.hash;

        // Built file is next to manifest.json
        manifest.main = "index.js";

        await writeFile(
            `${outDir}/manifest.json`,
            JSON.stringify(manifest, null, 2)
        );

        console.log(`Built ${plug}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}