#!/usr/bin/env python3
"""
创建简单的占位 PNG 图标用于微信小程序 tabBar
这些是临时占位图标，建议后续使用专业设计的图标替换
"""
import os
import base64
import struct
import zlib

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PNG_DIR = os.path.join(BASE_DIR, 'assets', 'icons', 'tab')

def create_simple_png(width, height, color):
    """创建一个简单的纯色 PNG 图标"""
    def png_chunk(chunk_type, data):
        chunk_len = len(data)
        chunk = struct.pack('>I', chunk_len) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        chunk += struct.pack('>I', crc)
        return chunk
    
    # PNG 签名
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8位 RGBA
    ihdr = png_chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (图像数据)
    r, g, b, a = color
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # 过滤器类型
        for x in range(width):
            raw_data += bytes([r, g, b, a])
    
    compressed = zlib.compress(raw_data, 9)
    idat = png_chunk(b'IDAT', compressed)
    
    # IEND chunk
    iend = png_chunk(b'IEND', b'')
    
    return signature + ihdr + idat + iend

def main():
    os.makedirs(PNG_DIR, exist_ok=True)
    
    # 定义图标颜色 (R, G, B, A)
    normal_color = (156, 140, 116, 255)  # #9C8C74 - 灰棕色
    active_color = (255, 217, 61, 255)   # #FFD93D - 黄色
    
    icons = ['home', 'chat', 'notes', 'quiz', 'profile']
    size = 81
    
    print("创建占位 PNG 图标...\n")
    
    for icon in icons:
        # 普通状态
        normal_png = create_simple_png(size, size, normal_color)
        normal_path = os.path.join(PNG_DIR, f'{icon}.png')
        with open(normal_path, 'wb') as f:
            f.write(normal_png)
        print(f"✓ 创建: {icon}.png")
        
        # 激活状态
        active_png = create_simple_png(size, size, active_color)
        active_path = os.path.join(PNG_DIR, f'{icon}-active.png')
        with open(active_path, 'wb') as f:
            f.write(active_png)
        print(f"✓ 创建: {icon}-active.png")
    
    print(f"\n完成！图标保存在: {PNG_DIR}")
    print("\n注意: 这些是临时占位图标（纯色方块）")
    print("建议使用专业设计的图标替换它们")

if __name__ == '__main__':
    main()
