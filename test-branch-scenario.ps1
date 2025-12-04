# ======================================================================
# 模拟真实项目中的多分支并行开发与合并
# 目标：
#   - feature/api    → 已合并（含两次提交）
#   - feature/ui     → 已合并（含两次提交，跨文件）
#   - feature/auth   → 已合并
# 所有合并均使用 --no-ff 强制生成合并提交，便于可视化依赖关系
# ======================================================================

# 进入测试仓库目录
Set-Location E:\TestRepo

# 初始化空 Git 仓库
git init

# 设置默认分支为 main（兼容新旧 Git 版本）
git branch -M main 2>$null

# 创建 README.md 文件（使用 UTF-8 编码，避免中文乱码）
echo "# TestRepo" | Out-File -Encoding UTF8 README.md

# 添加并提交 README（创建初始提交后 main 分支才真正存在）
git add README.md
git commit -m "chore: initial commit with README"


# 确保我们在 main 分支（此时 main 分支已存在）
git checkout main

# ------------------------------------------------------------------
# 第 1 步：开发 API 功能（两次迭代）
# ------------------------------------------------------------------
git checkout -b feature/api           # 从 main 创建 API 分支

# 确保 src 目录存在（PowerShell 不会自动创建父目录）
mkdir -Force src | Out-Null

# 第一次提交：API v1
echo "API v1" | Out-File -Encoding UTF8 src/api.ts
git add src/api.ts                    # ✅ 显式添加新文件（关键！）
git commit -m "feat: Add API v1"

# 第二次提交：更新到 v2（修改已跟踪文件，-a 可用）
echo "API v2" | Out-File -Encoding UTF8 src/api.ts
git commit -am "feat: Update API to v2"


# ------------------------------------------------------------------
# 第 2 步：开发 UI 功能（两个不同文件）
# ------------------------------------------------------------------
git checkout main                     # 切回 main（确保独立起点）
git checkout -b feature/ui            # 从干净的 main 创建 UI 分支

mkdir -Force src | Out-Null          # 确保目录存在

# 提交 1：UI 组件
echo "UI component" | Out-File -Encoding UTF8 src/ui.tsx
git add src/ui.tsx                    # ✅ 新文件必须显式 add
git commit -m "feat: Add UI component"

# 提交 2：样式文件
echo "UI styles" | Out-File -Encoding UTF8 src/styles.css
git add src/styles.css                # ✅ 新文件必须显式 add
git commit -m "feat: Add UI styles"


# ------------------------------------------------------------------
# 第 3 步：将 API 和 UI 合并到 main（强制非快进）
# ------------------------------------------------------------------
git checkout main

# 合并 API（--no-ff 确保生成合并提交节点）
git merge --no-ff feature/api -m "Merge branch 'feature/api' into main"

# 合并 UI（同样 --no-ff）
git merge --no-ff feature/ui -m "Merge branch 'feature/ui' into main"


# ------------------------------------------------------------------
# 第 4 步：开发 Auth 功能并合并
# ------------------------------------------------------------------
git checkout -b feature/auth          # 从当前 main（已含 api/ui）创建 auth 分支

echo "Auth service" | Out-File -Encoding UTF8 src/auth.ts
git add src/auth.ts                   # ✅ 新文件显式 add
git commit -m "feat: Add auth service"

# 切回 main 并合并
git checkout main
git merge --no-ff feature/auth -m "Merge branch 'feature/auth' into main"

# 显示最终的提交历史（便于验证）
Write-Host "`n=== 最终提交历史 ===" -ForegroundColor Green
git log --oneline --graph --all --decorate

Write-Host "`n=== 分支列表 ===" -ForegroundColor Green
git branch -a

