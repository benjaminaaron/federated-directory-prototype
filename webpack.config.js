import path from "path"

export default {
    entry: "./bundling.js",
    output: {
        filename: "bundle.js",
        path: path.resolve("src/assets"),
        library: {
            type: "module",
        },
    },
    experiments: {
        outputModule: true,
    },
    mode: "production"
}
