import {promises} from 'fs'

import * as esbuild from 'esbuild'

// const modulePath = fileURLToPath(import.meta.resolve("@excalidraw/excalidraw"))
// const distDir = resolve(join(modulePath, "..", "..", "browser", "prod", "excalidraw-assets"))
// await promises.cp(distDir, "./dist/excalidraw-dist", {recursive: true, errorOnExist: false})

const CustomJsonLoader = {
    name: 'custom-json-loader',
    setup({ onLoad }) {
        onLoad({ filter: /\.json$/ }, async args => {
            const text = await promises.readFile(args.path, 'utf8')
            return { contents: `export default ${text}` }
        })
    }
}

const TextReplacer = ({include, pattern, loader}) => ({
    name: 'text-replacer',
    setup({onLoad}) {
        onLoad({filter: include}, async args => {
            let contents = await promises.readFile(args.path, 'utf-8')
            for (const [from, to] of pattern) {
               contents = contents.replaceAll(from, to)
            }
            return { contents, loader }
        })
    }
})

await esbuild.build({
    entryPoints: ["./src/index.js"],
    outfile: "./dist/index.js",
    bundle: true,
    minify: true,
    format: "esm",
    define: {
        "process.env.IS_PREACT": "false",
        "window.EXCALIDRAW_ASSET_PATH": '"/node_modules/@prairielearn/excalidraw/dist/excalidraw-dist/"',
    },
    plugins: [CustomJsonLoader, TextReplacer({
        include: /.js$/,
        loader: 'js',
        pattern: [
            /* Prevent bootstrap style from hijacking visibility */
            ["dropdown-menu", "ex-dropdown-menu"],
        ]
    })]
})

await esbuild.build({
    entryPoints: ["@excalidraw/excalidraw/index.css"],
    outfile: "./dist/index.css",
    bundle: true,
    loader: { '.woff2': 'dataurl' },
    plugins: [TextReplacer({
        include: /.css$/,
        loader: 'css',
        pattern: [
            /* Prevent bootstrap style from hijacking visibility */
            [".dropdown-menu", ".ex-dropdown-menu"],
        ]
    })]
})
