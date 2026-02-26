import os
import json
import re
import requests
import datetime
import uuid
import time

# --- 新增的书名映射逻辑 ---
import_titles = []
try:
    with open('/Users/bowei/Desktop/智慧之匙-(wisdom-key)/database_books_import.json', 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                import_titles.append(json.loads(line)['title'])
    import_titles.sort(key=len, reverse=True)
except Exception as e:
    print(f"⚠️ 警告：无法加载 database_books_import.json 进行书名映射 ({e})")

def sanitize_book_name(raw_name):
    if raw_name in import_titles:
        return raw_name
    for t in import_titles:
        if t in raw_name:
            return t
    return raw_name

# ==========================================
# 配置区域
# ==========================================
# 你的 DeepSeek API Key (这里可以替换为你自己的 Key)
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "YOUR_DEEPSEEK_API_KEY_HERE")
BASE_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

# 存放需要生成题目的 md 文件夹，请将你要生成题目的原著 md 文件放在这个目录
INPUT_DIR = "/Users/bowei/Desktop/智慧之匙-(wisdom-key)/docs/RAG_books"
# 输出生成的题库 JSON 文件的路径，直接可导入云开发数据库
OUTPUT_FILE = "/Users/bowei/Desktop/智慧之匙-(wisdom-key)/database_export_batch.json"

# ==========================================
# 核心逻辑
# ==========================================

LEVEL_REQUIREMENTS = {
    1: '考察基础情节、人物名称、核心事件等直观内容。题目必须非常简单直接。',
    2: '考察人物动机、情节因果关系、隐含的深层含义等。需要一点点思考分析。',
    3: '考察细节挖掘、逻辑推理、词句赏析、乃至作品背后的文化内涵或写作手法。'
}

def generate_questions_for_chunk(book_name, chapter_name, chunk_text, level):
    """调用 DeepSeek 生成指定难度等级的题目"""
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
  }},
  // ...直到第10题
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
        # 清理多余的 Markdown 标记
        cleaned_reply = re.sub(r'^```json\s*', '', reply)
        cleaned_reply = re.sub(r'\s*```$', '', cleaned_reply)
        cleaned_reply = cleaned_reply.strip()
        
        questions = json.loads(cleaned_reply)
        
        # 兜底规范化格式
        valid_questions = []
        for i, q in enumerate(questions):
            ans = q.get('correctIndex', q.get('answer', 0)) # 兼容 answer 或 correctIndex
            valid_questions.append({
                "id": i + 1,
                "question": q.get('question', ''),
                "options": q.get('options', [])[:4],
                "correctIndex": ans if isinstance(ans, int) else 0,
                "explanation": q.get('explanation', '暂无解析')
            })
            
        return valid_questions
        
    except Exception as e:
        print(f"❌ 生成题目失败 (等级 {level}): {str(e)}")
        if 'response' in locals() and hasattr(response, 'text'):
            print(f"响应内容: {response.text}")
        return None

def process_book_file(filepath):
    """解析 Markdown 书籍文件，切分为多个 Chunk 并生成题目"""
    if not os.path.exists(filepath):
        print(f"⚠️ 文件不存在: {filepath}")
        return
        
    raw_name = os.path.splitext(os.path.basename(filepath))[0]
    book_name = sanitize_book_name(raw_name)
    print(f"\n==================== 开始处理书籍: 《{book_name}》 (原文件: {raw_name}) ====================")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # 如果文本中含有 ===CHUNK===，按此标志分割；否则整本书当成一个 Chunk
    chunks = []
    if "===CHUNK===" in content:
        raw_chunks = content.split("===CHUNK===")
        chunks = [c.strip() for c in raw_chunks if c.strip()]
    else:
        # 如果没有 ===CHUNK===，尝试通过二级标题 ## 切分
        raw_chunks = re.split(r'\n(?=## )', content)
        chunks = [c.strip() for c in raw_chunks if c.strip()]
        if not chunks:
             chunks = [content.strip()]

    # 准备写入文件 (以追加模式打开 a)
    with open(OUTPUT_FILE, 'a', encoding='utf-8') as out_f:
        for index, chunk_text in enumerate(chunks):
            # 尝试提取当前 Chunk 的标题
            chapter_name = f"片段 {index + 1}"
            header_match = re.search(r'^#+\s+(.+)$', chunk_text, re.MULTILINE)
            if header_match:
                chapter_name = header_match.group(1).strip()
                
            print(f"\n---> 开始生成章节: [{chapter_name}] 的题库")
            
            # 避免对单纯的标语/极短文本出题
            if len(chunk_text) < 50:
                print("文本过短，跳出出题。")
                continue
                
            for level in [1, 2, 3]:
                print(f"  🤖 正在生成 Level {level} 题库 (10道题)...")
                questions = generate_questions_for_chunk(book_name, chapter_name, chunk_text, level)
                
                if questions and len(questions) > 0:
                    # 组装符合微信云开发导入格式的 JSON 对象
                    doc_record = {
                        "_id": uuid.uuid4().hex, # 生成唯一 ID
                        "book_name": book_name,
                        "chapter": chapter_name,
                        "level": level,
                        "questions": questions,
                        "created_at": { "$date": datetime.datetime.utcnow().isoformat() + "Z" }, # 云数据库特定的日期格式
                        "source": "ai_generated_batch",
                        "version": 1
                    }
                    
                    # 写入一行 JSON (\n 结尾，即 JSONL 格式)
                    out_f.write(json.dumps(doc_record, ensure_ascii=False) + "\n")
                    print(f"  ✅ Level {level} 生成成功并写入文件！")
                else:
                    print(f"  ❌ Level {level} 生成失败。")
                
                # 增加延迟防并发限制
                time.sleep(1)

if __name__ == "__main__":
    if not os.path.exists(INPUT_DIR):
        print(f"请创建文件夹 {INPUT_DIR} 并放入需要出题的 .md 文件！")
    else:
        # 如果输出文件已存在，先清空它
        if os.path.exists(OUTPUT_FILE):
             os.remove(OUTPUT_FILE)
             
        # 遍历输入目录下的所有 md 文件
        for filename in os.listdir(INPUT_DIR):
            if filename.endswith(".md"):
                file_path = os.path.join(INPUT_DIR, filename)
                process_book_file(file_path)
                
        print(f"\n🎉 所有题库生成完毕！输出文件位置: {OUTPUT_FILE}")
        print("💡 请前往微信开发者工具 -> 云开发 -> 数据库 -> questions 集合，选择【导入】并上传此 JSON 文件（如果是遇到格式要求冲突，选“JSON 格式”会有最佳效果）。")
