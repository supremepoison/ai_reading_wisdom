#!/usr/bin/env python3
"""
智能重试脚本：扫描已有的 database_export_batch.json，
找出所有缺失的 (book, chapter, level) 组合并补生成。
结果追加到同一个 JSON 文件中。
"""
import os
import json
import re
import requests
import datetime
import uuid
import time
from collections import defaultdict

# ==========================================
# 配置区域
# ==========================================
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "YOUR_DEEPSEEK_API_KEY_HERE")
BASE_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

INPUT_DIR = "/Users/bowei/Desktop/智慧之匙-(wisdom-key)/docs/RAG_books"
OUTPUT_FILE = "/Users/bowei/Desktop/智慧之匙-(wisdom-key)/database_export_batch.json"

LEVEL_REQUIREMENTS = {
    1: '考察基础情节、人物名称、核心事件等直观内容。题目必须非常简单直接。',
    2: '考察人物动机、情节因果关系、隐含的深层含义等。需要一点点思考分析。',
    3: '考察细节挖掘、逻辑推理、词句赏析、乃至作品背后的文化内涵或写作手法。'
}

# ==========================================
# 第一步：解析已成功生成的记录
# ==========================================
def load_existing_records():
    """读取已有的 JSON 文件，返回已完成的 (book, chapter, level) 集合"""
    existing = set()
    if not os.path.exists(OUTPUT_FILE):
        return existing
    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                existing.add((r['book_name'], r['chapter'], r['level']))
            except:
                pass
    return existing

# ==========================================
# 第二步：扫描所有 Markdown 文件，提取 (book, chapter) 列表
# ==========================================
def scan_all_books():
    """扫描 INPUT_DIR 下所有 .md 文件，返回 {book_name: [chapter_name, ...]}"""
    all_books = {}
    for filename in sorted(os.listdir(INPUT_DIR)):
        if not filename.endswith(".md"):
            continue
        filepath = os.path.join(INPUT_DIR, filename)
        book_name = os.path.splitext(filename)[0]
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        chapters = []
        if "===CHUNK===" in content:
            raw_chunks = content.split("===CHUNK===")
            chunks = [c.strip() for c in raw_chunks if c.strip()]
        else:
            raw_chunks = re.split(r'\n(?=## )', content)
            chunks = [c.strip() for c in raw_chunks if c.strip()]
            if not chunks:
                chunks = [content.strip()]

        for index, chunk_text in enumerate(chunks):
            if len(chunk_text) < 50:
                continue
            chapter_name = f"片段 {index + 1}"
            header_match = re.search(r'^#+\s+(.+)$', chunk_text, re.MULTILINE)
            if header_match:
                chapter_name = header_match.group(1).strip()
            chapters.append((chapter_name, chunk_text))
        
        all_books[book_name] = chapters
    return all_books

# ==========================================
# 第三步：生成题目（与原脚本一致）
# ==========================================
def generate_questions(book_name, chapter_name, chunk_text, level):
    req_desc = LEVEL_REQUIREMENTS[level]
    
    system_prompt = f"""你是一位专业的阅读理解出题专家。你的任务是基于给定的原著节选文本，生成高质量的单项选择题。
    
【出题规则】
1. **书名**：《{book_name}》
2. **章节名称**：{chapter_name}
3. **难度等级**：Level {level}。要求：{req_desc}
4. **题目数量**：必须生成 **10** 道单选题。
5. **绝对忠于文本**：所有题目的答案必须能够从给定的节选文本中找到依据。
6. **输出格式**：必须且只能输出一个 **纯 JSON 数组**，不要包含任何 Markdown 代码块标签（如 ```json），也不要解释文字。
格式范例：
[
  {{
    "id": 1,
    "question": "题目内容？",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correctIndex": 0, 
    "explanation": "解析内容"
  }}
]
"""
    user_prompt = f"以下是节选文本内容：\n\n{chunk_text}\n\n请针对以上文本，严格按照要求的难度等级（Level {level}）生成 10 道选择题。"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.4
    }

    try:
        response = requests.post(BASE_URL, json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        
        reply = response.json()["choices"][0]["message"]["content"]
        cleaned = re.sub(r'^```json\s*', '', reply)
        cleaned = re.sub(r'\s*```$', '', cleaned).strip()
        
        questions = json.loads(cleaned)
        
        valid = []
        for i, q in enumerate(questions):
            ans = q.get('correctIndex', q.get('answer', 0))
            valid.append({
                "id": i + 1,
                "question": q.get('question', ''),
                "options": q.get('options', [])[:4],
                "correctIndex": ans if isinstance(ans, int) else 0,
                "explanation": q.get('explanation', '暂无解析')
            })
        return valid
        
    except Exception as e:
        print(f"    ❌ 生成失败 (Level {level}): {str(e)}")
        return None

# ==========================================
# 主流程
# ==========================================
def main():
    print("🔍 第一步：扫描已完成的记录...")
    existing = load_existing_records()
    print(f"   已有 {len(existing)} 条记录。")

    print("📂 第二步：扫描所有书籍文件...")
    all_books = scan_all_books()
    total_books = len(all_books)
    total_chapters = sum(len(chs) for chs in all_books.values())
    print(f"   发现 {total_books} 本书，共 {total_chapters} 个章节。")

    # 计算缺失的
    missing = []
    for book_name, chapters in all_books.items():
        for chapter_name, chunk_text in chapters:
            for level in [1, 2, 3]:
                if (book_name, chapter_name, level) not in existing:
                    missing.append((book_name, chapter_name, chunk_text, level))

    print(f"\n🔴 第三步：发现 {len(missing)} 条缺失记录，开始补生成...")
    
    if len(missing) == 0:
        print("🎉 所有题目均已完整，无需重试！")
        return

    success_count = 0
    fail_count = 0

    with open(OUTPUT_FILE, 'a', encoding='utf-8') as out_f:
        current_book = None
        for i, (book_name, chapter_name, chunk_text, level) in enumerate(missing):
            if book_name != current_book:
                current_book = book_name
                print(f"\n==================== 补充书籍: 《{book_name}》 ====================")

            print(f"  [{i+1}/{len(missing)}] {chapter_name} - Level {level}...")
            questions = generate_questions(book_name, chapter_name, chunk_text, level)

            if questions and len(questions) > 0:
                doc_record = {
                    "_id": uuid.uuid4().hex,
                    "book_name": book_name,
                    "chapter": chapter_name,
                    "level": level,
                    "questions": questions,
                    "created_at": {"$date": datetime.datetime.utcnow().isoformat() + "Z"},
                    "source": "ai_generated_batch_retry",
                    "version": 1
                }
                out_f.write(json.dumps(doc_record, ensure_ascii=False) + "\n")
                out_f.flush()  # 实时写入
                print(f"    ✅ 成功！")
                success_count += 1
            else:
                print(f"    ❌ 失败！")
                fail_count += 1

            time.sleep(1)

    print(f"\n{'='*50}")
    print(f"🎉 补生成完毕！")
    print(f"   ✅ 成功: {success_count}")
    print(f"   ❌ 失败: {fail_count}")
    print(f"   📂 输出: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
