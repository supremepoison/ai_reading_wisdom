#!/bin/bash
# sync-config.sh - 同步配置到所有云函数

# ========== 在这里配置 ==========
API_KEY="sk-your-api-key-here"
BASE_URL="https://api.deepseek.com"
MODEL="deepseek-chat"
# ================================

CONFIG_CONTENT="// config.js - 自动生成，请勿手动修改
// 由 sync-config.sh 同步
module.exports = {
    CONFIG: {
        DEFAULT_API_KEY: '${API_KEY}',
        DEFAULT_BASE_URL: '${BASE_URL}',
        DEFAULT_MODEL: '${MODEL}'
    }
};"

# 需要同步的云函数目录
FUNCTIONS=(
    "cloudfunctions/chatWithAI"
    "cloudfunctions/generateQuiz"
    "cloudfunctions/generateNote"
    "cloudfunctions/generateNoteQuestions"
)

echo "🔄 开始同步配置..."

for func in "${FUNCTIONS[@]}"; do
    if [ -d "$func" ]; then
        echo "$CONFIG_CONTENT" > "$func/config.js"
        echo "✅ 已同步: $func/config.js"
    else
        echo "⚠️  目录不存在: $func"
    fi
done

echo "🎉 配置同步完成！"
echo ""
echo "请记得重新上传以下云函数："
for func in "${FUNCTIONS[@]}"; do
    echo "  - $func"
done
