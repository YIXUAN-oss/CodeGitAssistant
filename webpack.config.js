const path = require('path');

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
    target: 'node',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
        clean: true // 自动清理输出目录
    },
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        // 优化解析性能
        cacheWithContext: false
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            // 优化编译性能
                            transpileOnly: false,
                            compilerOptions: {
                                sourceMap: true
                            }
                        }
                    }
                ]
            }
        ]
    },
    devtool: process.env.NODE_ENV === 'production' ? 'hidden-source-map' : 'source-map',
    infrastructureLogging: {
        level: process.env.NODE_ENV === 'production' ? 'error' : 'info'
    },
    // 优化构建性能
    optimization: {
        minimize: process.env.NODE_ENV === 'production',
        // 移除未使用的代码
        usedExports: true
    },
    // 性能提示
    performance: {
        hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
        maxEntrypointSize: 512000, // 512KB
        maxAssetSize: 512000
    }
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
    target: 'web',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: './src/webview/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist/webview'),
        filename: 'webview.js',
        chunkFilename: '[name].chunk.js', // 代码分割的 chunk 文件名
        clean: true // 自动清理输出目录
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        // 优化解析性能
        cacheWithContext: false
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: path.resolve(__dirname, 'src/webview/tsconfig.json'),
                            transpileOnly: false,
                            compilerOptions: {
                                sourceMap: true
                            }
                        }
                    }
                ]
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    devtool: process.env.NODE_ENV === 'production' ? 'hidden-source-map' : 'source-map',
    // 优化构建
    optimization: {
        minimize: process.env.NODE_ENV === 'production',
        // 代码分割：分离第三方库
        // 注意：对于 webview，代码分割可能导致加载问题，暂时禁用
        // 如果需要启用，需要修改 dashboard-panel.ts 中的脚本加载逻辑
        splitChunks: false,
        // 移除未使用的代码
        usedExports: true,
        sideEffects: false
    },
    // 性能提示
    performance: {
        hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
        maxEntrypointSize: 1024000, // 1MB (webview 可能较大)
        maxAssetSize: 1024000
    }
};

module.exports = [extensionConfig, webviewConfig];

