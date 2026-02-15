#!/usr/bin/env python3
"""
将 SVG 图标转换为 PNG 格式用于微信小程序 tabBar
"""
import os
import cairosvg

# 路径配置
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG_DIR = os.path.join(BASE_DIR, 'assets', 'icons')
PNG_DIR = os.path.join(BASE_DIR, 'assets', 'icons', 'tab')

# 需要转换的图标
ICONS = ['home', 'chat', 'notes', 'quiz', 'profile']

# 输出尺寸 (微信小程序建议 81x81)
SIZE = 81

def convert_svg_to_png(svg_path, png_path, size=SIZE):
    """将 SVG 转换为 PNG"""
    try:
        cairosvg.svg2png(
            url=svg_path,
            write_to=png_path,
            output_width=size,
            output_height=size
        )
        print(f"✓ 转换成功: {os.path.basename(png_path)}")
        return True
    except Exception as e:
        print(f"✗ 转换失败 {os.path.basename(svg_path)}: {e}")
        return False

def main():
    # 确保输出目录存在
    os.makedirs(PNG_DIR, exist_ok=True)
    
    print("开始转换 SVG 图标为 PNG...\n")
    
    success_count = 0
    total_count = 0
    
    for icon in ICONS:
        # 普通状态
        svg_normal = os.path.join(SVG_DIR, f'{icon}.svg')
        png_normal = os.path.join(PNG_DIR, f'{icon}.png')
        
        if os.path.exists(svg_normal):
            total_count += 1
            if convert_svg_to_png(svg_normal, png_normal):
                success_count += 1
        
        # 激活状态
        svg_active = os.path.join(SVG_DIR, f'{icon}-active.svg')
        png_active = os.path.join(PNG_DIR, f'{icon}-active.png')
        
        if os.path.exists(svg_active):
            total_count += 1
            if convert_svg_to_png(svg_active, png_active):
                success_count += 1
    
    print(f"\n转换完成: {success_count}/{total_count} 个图标")
    print(f"输出目录: {PNG_DIR}")

if __name__ == '__main__':
    main()
