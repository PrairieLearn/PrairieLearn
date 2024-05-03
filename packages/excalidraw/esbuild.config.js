import {cpSync} from 'fs'
import {join, resolve} from 'path'
import {fileURLToPath} from 'url'

import * as esbuild from 'esbuild'
import textReplace from 'esbuild-plugin-text-replace'

const modulePath = fileURLToPath(import.meta.resolve("@excalidraw/excalidraw"))
const distDir = resolve(join(modulePath, "..", "dist"))

cpSync(distDir, "./dist/excalidraw-dist", {recursive: true, errorOnExist: false})

esbuild.build({
    entryPoints: ["./src/index.js"],
    outfile: "./dist/index.js",
    bundle: true,
    minify: true,
    format: "esm",
    define: {
        "process.env.IS_PREACT": "false",
        "window.EXCALIDRAW_ASSET_PATH": '"/node_modules/@prairielearn/excalidraw/dist/excalidraw-dist/"',
    },
    plugins: [textReplace({
        include: /.+/,
        pattern: [
            /* Prevent bootstrap style from hijacking visibility */
            ["dropdown-menu", "ex-dropdown-menu"],
        ]
    })]
})
