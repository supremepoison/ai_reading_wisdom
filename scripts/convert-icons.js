/**
 * 这个脚本用于将 SVG 图标转换为微信小程序 tabBar 所需的 PNG 格式
 * 
 * 使用方法：
 * 1. 安装 sharp: npm install sharp
 * 2. 运行: node scripts/convert-icons.js
 * 
 * 或者手动使用在线工具转换：
 * - https://cloudconvert.com/svg-to-png
 * - https://svgtopng.com/
 * 
 * 微信小程序 tabBar 图标要求：
 * - 格式: PNG/JPG/JPEG
 * - 尺寸: 81x81 像素（建议）
 * - 大小: 不超过 40KB
 */

const fs = require('fs');
const path = require('path');

// 检查是否安装了 sharp
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('请先安装 sharp: npm install sharp');
    console.log('或者手动使用在线工具将以下 SVG 文件转换为 PNG:');
    console.log('');

    const svgDir = path.join(__dirname, '../assets/icons');
    const svgFiles = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg'));

    svgFiles.forEach(file => {
        console.log(`  - ${file}`);
    });

    console.log('');
    console.log('转换后的 PNG 文件放在 assets/icons/tab/ 目录下');
    process.exit(1);
}

const iconNames = ['home', 'chat', 'notes', 'quiz', 'profile'];
const srcDir = path.join(__dirname, '../assets/icons');
const destDir = path.join(__dirname, '../assets/icons/tab');

async function convertIcon(name) {
    const normalSvg = path.join(srcDir, `${name}.svg`);
    const activeSvg = path.join(srcDir, `${name}-active.svg`);

    const normalPng = path.join(destDir, `${name}.png`);
    const activePng = path.join(destDir, `${name}-active.png`);

    if (fs.existsSync(normalSvg)) {
        await sharp(normalSvg)
            .resize(81, 81)
            .png()
            .toFile(normalPng);
        console.log(`✓ 转换: ${name}.svg -> ${name}.png`);
    }

    if (fs.existsSync(activeSvg)) {
        await sharp(activeSvg)
            .resize(81, 81)
            .png()
            .toFile(activePng);
        console.log(`✓ 转换: ${name}-active.svg -> ${name}-active.png`);
    }
}

async function main() {
    // 确保目标目录存在
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    console.log('开始转换 SVG 图标为 PNG...\n');

    for (const name of iconNames) {
        await convertIcon(name);
    }

    console.log('\n转换完成！');
}

main().catch(console.error);
