/**
 * 复制 Web 资源文件（CSS 等）和 D3 库到输出目录
 */
const fs = require('fs');
const path = require('path');

// 复制 CSS 文件
const sourceDir = path.join(__dirname, '..', 'web', 'styles');
const targetDir = path.join(__dirname, '..', 'media', 'styles');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

const cssFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.css'));

cssFiles.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied ${file} to ${targetPath}`);
});

console.log('Web assets copied successfully!');

