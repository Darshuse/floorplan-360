<div align="center">

# 🗺️ Floorplan 360

**خريطة معمارية تفاعلية ذكية لأي مشروع برمجي — تدعم العربية (`RTL`) والإنجليزية (`LTR`)، وتعمل مع جميع وكلاء الذكاء الاصطناعي، وبوضع مبسط للبيزنس والإدارة بدون أي مكتبات خارجية.**

*Interactive 360° codebase architecture & executive business map — Bilingual (Arabic RTL / English LTR), Multi-Agent, Offline-Capable, Zero npm dependencies.*

[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](#-المتطلبات-والتثبيت-في-30-ثانية)
[![Zero Dependencies](https://img.shields.io/badge/npm%20packages-0%20(Zero)-10b981)](#-ضمانات-الأمان-والخصوصية)
[![Arabic + English](https://img.shields.io/badge/Language-العربية%20RTL%20%7C%20English%20LTR-8b5cf6)](#-ماذا-أضفنا-على-المهارة-الأصلية)
[![Business + Tech View](https://img.shields.io/badge/Modes-وضع%20البيزنس%20%7C%20الوضع%20التقني-0ea5e9)](#-وضع-البيزنس-المبسط-مقابل-الوضع-التقني)
[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Passing-2563eb)](#running-tests)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b)](./LICENSE)

[**🇸🇦 الدليل العربي السريع**](#-ما-هي-مهارة-floorplan-360-ببساطة) · [**⚡ التثبيت في خطوة واحدة**](#-المتطلبات-والتثبيت-في-30-ثانية) · [**✨ الإضافات والتحسينات**](#-ماذا-أضفنا-على-المهارة-الأصلية) · [**🇬🇧 English Guide**](#-english-guide)

</div>

---

## 💡 ما هي مهارة Floorplan 360 ببساطة؟

عندما تفتح مشروعاً برمجياً كبيراً (أو تريد شرح فكرة مشروع لمديرك أو فريقك)، قراءة مئات الملفات والمجلدات مهمة مرهقة.

مهارة **Floorplan 360** تحوّل أي مشروع برمجي — أو حتى ملف متطلبات مكتوب (`PRD`) قبل كتابة سطر كود واحد — إلى **خريطة تفاعلية حية في المتصفح (`floorplan/index.html`)** يمكنك:
1. **التجوّل بداخلها بـعدة مستويات تقريب (Zoom):** من نظرة عامة على النظام بالكامل، وصولاً إلى كل شاشة وخدمة وملف ومسار `API`.
2. **التبديل بضغطة زر بين وضعين:**
   - **👔 وضع البيزنس المبسط (`وضع البيزنس`):** يشرح المشروع بلغة الأعمال ورحلة المستخدم والجهات المتكاملة، ويخفي الكود وأرقام الأسطر والاختبارات تماماً.
   - **🛠️ الوضع التقني (`الوضع التقني`):** يعرض للمبرمجين المسارات، الدوال، جودة الكود، والاستيرادات بين الملفات.
3. **سؤال الخريطة مباشرة بالعربي أو الإنجليزي (`Ask Bar`):** تسألها *"كيف يعمل تسجيل الدخول؟"* أو *"ما هي الخدمات المتصلة ببوابة الدفع؟"* فتجيبك بالعربية الفصحى الواضحة وتلوّن لك المسار خطوة بخطوة على الخريطة!
4. **فحص صحة وأمان الكود تلقائياً (`Health`):** بدون الحاجة لتشغيل المشروع أو قواعد البيانات نهائياً.

> **🔗 المشروع الأصلي (Upstream Attribution):**
> بُنيت **Floorplan 360** كتطوير شامل فوق مهارة **[haydenschmitty/floorplan](https://github.com/haydenschmitty/floorplan)** الرائعة، مع الحفاظ الكامل على فلسفتها (صفر مكتبات `npm`، وعدم تلويث سجل `git` الخاص بمشروعك).

---

## ✨ ماذا أضفنا على المهارة الأصلية؟

طوّرنا المهارة الأصلية **[floorplan](https://github.com/haydenschmitty/floorplan)** بـ **6 تحسينات جوهرية** تجعلها جاهزة للاستخدام اليومي لكل مطور وفريق عربي وعالمي:

- 🤖 **تعمل مع أي وكيل ذكاء اصطناعي (فك الحصرية تماماً):**
  - النسخة الأصلية كانت مقيّدة بـ `Claude` أو `Codex` فقط.
  - **Floorplan 360** تعمل مع **Google Antigravity**، **Claude Code**، **Codex**، **Cursor**، **Windsurf**، **Gemini CLI**، **Kimi CLI**، ومزوّدات **Gemini / Moonshot / OpenRouter / DeepSeek**، ونماذج **Ollama** المحلية، بالإضافة إلى **محرك محلي مدمج (`Local Engine`)** يعمل **100% بدون إنترنت وبدون أي مفتاح API**!
- 🇸🇦 **دعم عربي أصيل 100% (واجهة + بحث ذكي + ردود عربية كاملة):**
  - زر تبديل فوري **`عربي / EN`** يقلب اتجاه الواجهة (`RTL / LTR`) بسلاسة تامة.
  - محرك بحث عربي ذكي يفهم الجذور العربية ويربط سؤالك العربي (مثل *"الفواتير"* أو *"تسجيل الدخول"*) بالملفات البرمجية الإنجليزية داخل الكود.
  - ردود عربية سليمة 100% في شريط الأسئلة مع استبعاد ملفات الاختبارات الوهمية تلقائياً حتى تبقى الإجابة نقية ومفيدة.
- 👔 **وضع البيزنس المبسط (`وضع البيزنس` — زر علوي أو حرف `B`):**
  - إضافة غير موجودة في النسخة الأصلية، صُممت خصيصاً لاجتماعات أصحاب المصلحة ومديري المنتجات والإدارة التنفيذية: تخفي ملفات الاختبارات والإعدادات وأرقام الأسطر ومصطلحات الكود، وتعرض مؤشرات تنفيذية واضحة ورحلات عمل مفهومة لغير التقنيين.
- 🛡️ **فحص صحة وأمان ثابت أذكى بدون إنذارات كاذبة (`3-Hop Static Health`):**
  - يفحص الكود المصدري كما هو على جهازك **دون الحاجة لتشغيل المشروع**.
  - يتتبّع حماية الجلسات والصلاحيات عبر **3 طبقات** (`Router ← Usecase ← Service`) فلا يعطي إنذارات كاذبة في المشاريع المبنية بـ Clean Architecture.
  - يفرّق بذكاء بين إعدادات بيئة التطوير (`vite.config.ts`) وبين الأخطاء الحقيقية، ويعرض لوحة الفحص مترجمة بالكامل للعربية.
- 📐 **حوكمة معمارية وخريطة جودة الكود (`Quality Heatmap`):**
  - اكتشاف حلقات الاستيراد الدائري بين الملفات، والتحقق من قواعد عزل الطبقات (`layerRules`)، وتلوين الملفات حرارياً حسب نظافة الكود وتعقيده.
- ⚡ **إضاءة المسارات (`Spotlight`) والتحديث التلقائي (`--auto-refresh`):**
  - عند الضغط على أي بطاقة، تخفت العناصر غير المرتبطة وتضيء الاتصالات الداخلة **بالأزرق** والخارجة **بالأخضر الزمردي** بحركة اتجاهية واضحة، مع إمكانية تحديث الخريطة تلقائياً كلما عدّلت الكود.

### مقارنة سريعة: النسخة الأصلية مقابل Floorplan 360

| الميزة | النسخة الأصلية (`floorplan`) | **نسختنا (`floorplan-360`)** |
| :--- | :---: | :---: |
| وكلاء الذكاء الاصطناعي المدعومون | Claude & Codex فقط | **جميع الوكلاء + APIs + Ollama + محرك أوفلاين مدمج** |
| واجهة عربية كاملة (`RTL`) وردود بالعربي | ❌ | ✅ **100% عربي وإنجليزي بضغطة زر** |
| وضع البيزنس المبسط لغير التقنيين (`Business Mode`) | ❌ | ✅ **مدمج بزر مباشر (`وضع البيزنس` / `B`)** |
| فحص صلاحيات الـ API عبر طبقات الـ `Usecase` | طبقة واحدة فقط | ✅ **تتبّع عميق حتى 3 طبقات بدون تشغيل المشروع** |
| فحص جودة الكود والاستيراد الدائري وقواعد الطبقات | ❌ | ✅ **مدمج مع خريطة حرارية (`Quality Heatmap`)** |
| التحديث التلقائي مع تعديلات الكود وGit Hooks | يدوي | ✅ **`--auto-refresh` + `--install-hook`** |

---

## ⚡ المتطلبات والتثبيت في 30 ثانية

- **المتطلب الوحيد:** وجود **[Node.js 18+](https://nodejs.org/)** على جهازك فقط. **(لا يوجد `npm install` ولا توجد أي مكتبات خارجية!)**

اختر الأداة التي تستخدمها وانسخ الأمر في الـ Terminal:

### 1. Google Antigravity
```powershell
# Windows (PowerShell)
git clone https://github.com/Darshuse/floorplan-360.git "$HOME\.gemini\config\skills\floorplan"
```
```bash
# macOS / Linux
git clone https://github.com/Darshuse/floorplan-360.git ~/.gemini/config/skills/floorplan
```

### 2. Claude Code
```bash
git clone https://github.com/Darshuse/floorplan-360.git ~/.claude/skills/floorplan
```

### 3. Cursor / Windsurf / Codex / أي محرر يدعم Skills
```bash
# تثبيت عام لـ Codex:
git clone https://github.com/Darshuse/floorplan-360.git ~/.codex/skills/floorplan

# أو داخل مجلد مشروعك مباشرة:
git clone https://github.com/Darshuse/floorplan-360.git .agents/skills/floorplan
```

---

## 🚀 طريقة الاستخدام (بأبسط شكل ممكن)

### الخطوة 1: اطلب من المساعد الذكي رسم الخريطة
افتح أي مشروع برمجي لديك داخل المحرر، واكتب للمساعد الذكي جملة عادية مثل:

- 💬 **لمشروع موجود (بالعربي):**
  > `"ارسم خريطة معمارية للمشروع بالعربي باستخدام floorplan وافتحها في المتصفح"`
- 💬 **لفكرة مشروع جديد قبل كتابة الكود (PRD / Blueprint):**
  > `"عندي ملف متطلبات المشروع في docs/prd.md — ارسم له مخطط floorplan تفاعلي بالعربي"`
- 💬 **لتحديث الخريطة بعد تعديل الكود:**
  > `"حدّث خريطة floorplan بعد التعديلات الأخيرة"`

سيقوم المساعد تلقائياً بفحص الكود، إنشاء مجلد `floorplan/` (معزول تلقائياً عن `git` حتى لا يزعج مستودعك)، وفتح الخريطة لك في المتصفح!

---

### الخطوة 2: استكشف الخريطة بسهولة من المتصفح

| الزر / الاختصار | ماذا يفعل لك؟ |
| :--- | :--- |
| **👔 `وضع البيزنس` (`B`)** | يحوّل الخريطة والشروحات والردود فوراً إلى **عرض مبسط للإدارة والبيزنس** بدون أي مسارات ملفات أو تعقيد برمجي. |
| **🌐 `عربي / EN` (`L`)** | يبدّل لغة واتجاه الخريطة بالكامل بين العربية (`RTL`) والإنجليزية (`LTR`). |
| **✓ `الصحة` (`Health`)** | يعرض نتيجة الفحص الأمني والمعماري الثابت للكود (مفاتيح مسربة، مسارات غير محمية، حلقات دائرية). |
| **💬 شريط السؤال بالأسفل (`Ask`)** | اكتب أي سؤال بالعربي أو الإنجليزي + اختر المحرك الذي تفضله من القائمة بجانب حقل الإدخال (`المحرك المحلي` أو أي AI لديك). |
| **▶️ `المسارات` (`Flows`)** | يعرض رحلات العمل خطوة بخطوة مع تحريك الكاميرا تلقائياً بين أجزاء النظام. |
| **📤 `تصدير` (`Export`)** | يحفظ الخريطة كملف `HTML` واحد مستقل يعمل بدون إنترنت لتشاركه مع فريقك أو عميلك بأمان تام. |
| **🖥️ عرض تقديمي (`P`)** | يخفي الأشرطة الجانبية لعرض الخريطة بملء الشاشة في الاجتماعات. |

---

### الخطوة 3 (اختيارية): ربط محركات الذكاء الاصطناعي الإضافية في شريط `Ask`

شريط الأسئلة يعمل **فوراً وبدون إنترنت** عبر **`المحرك المحلي` (`Local Engine`)**.
وإذا أردت استخدام نماذج ذكاء اصطناعي خارجية داخل الخريطة، سيتعرف عليها الخادم تلقائياً بمجرد توفرها على جهازك:

- **وكلاء الـ CLI الجاهزون تلقائياً:** `Antigravity (agy)`، `Claude Code`، `Codex`، `Gemini CLI`، `Kimi CLI`.
- **نماذج محلية مجانية:** شغّل **[Ollama](https://ollama.com/)** على جهازك وسيتعرف عليه تلقائياً على `http://127.0.0.1:11434`.
- **مفاتيح API مباشرة (اختياري):**
  ```bash
  export GEMINI_API_KEY="AIza..."          # Google Gemini
  export MOONSHOT_API_KEY="sk-..."         # Kimi / Moonshot
  export OPENROUTER_API_KEY="sk-or-..."    # OpenRouter / OpenAI / DeepSeek
  ```

---

## 🛠️ أوامر الـ Terminal المباشرة (للمستخدمين المتقدمين)

```bash
# فحص حالة الخريطة في المشروع
node "<SKILL_DIR>/scripts/status.mjs" "<مسار-المشروع>"

# مسح الكود المصدري وبناء الخريطة
node "<SKILL_DIR>/scripts/scan.mjs" "<مسار-المشروع>"
node "<SKILL_DIR>/scripts/build.mjs" "<مسار-المشروع>"

# تشغيل الخادم المحلي مع مراقبة التعديلات وتحديث الخريطة تلقائياً
node "<SKILL_DIR>/scripts/open.mjs" "<مسار-المشروع>" --auto-refresh

# تفعيل خطاف Git لتحديث الخريطة تلقائياً بعد كل git commit / git pull
node "<SKILL_DIR>/scripts/refresh.mjs" "<مسار-المشروع>" --install-hook

# تصدير ملف HTML واحد للمشاركة بدون إنترنت (يمسح المسارات المحلية تلقائياً)
node "<مسار-المشروع>/floorplan/serve.mjs" --export map.html --include flows,notes,health
```

---

<div id="-english-guide"></div>

## 🇬🇧 English Guide

### What is Floorplan 360?

**Floorplan 360** is a universal AI agent skill that turns any codebase, polyglot monorepo, or pre-code PRD into a self-contained interactive architecture map (`floorplan/index.html`) — built on top of the original **[haydenschmitty/floorplan](https://github.com/haydenschmitty/floorplan)** with major upgrades for multi-agent teams, Arabic/English bilingual teams, executive stakeholders, and Clean Architecture governance.

### Key Enhancements Over Upstream [`haydenschmitty/floorplan`](https://github.com/haydenschmitty/floorplan)

1. **Universal Multi-Agent Ask Bar (Zero Vendor Lock-In):**
   - Supports **Google Antigravity (`agy`)**, **Claude Code**, **OpenAI Codex**, **Gemini CLI**, **Kimi CLI**, custom CLIs, direct zero-dependency HTTP tool loops (**Gemini**, **Moonshot/Kimi**, **OpenRouter / OpenAI / DeepSeek**, **Ollama**), plus a **100% Offline Smart Local Engine** with automatic fallback.
2. **Full Native Arabic (`RTL`) & English (`LTR`) Support:**
   - Instant `عربي / EN` toggle (`L`), Arabic morphological light stemmer + BM25-lite bilingual search, and 100% fluent Arabic answers with automatic test-file filtering.
3. **Simplified Business Mode (`Business view` / `وضع البيزنس` — Shortcut `B`):**
   - Declutters the map for product managers and executives by hiding test/config/script plumbing, stripping file paths, line numbers, Git hashes, and code metrics, and rewriting answers & readiness checks in plain business language.
4. **3-Hop Static Security & Health Analyzer (No Running App Needed):**
   - Traces authentication across `Router → Usecase → Service` (3 hops deep), eliminates false positives on dev-proxy configs (`vite.config.ts`) and parameterless public cached feeds, and localizes the Health panel.
5. **Architecture Governance & Clean Code Quality Heatmap:**
   - Tarjan SCC circular dependency detection, declarative `layerRules` enforcement in `architecture.json`, and Uncle Bob / SonarQube Clean Code file grading.
6. **Neighborhood Spotlight, Presentation Mode (`P`) & `--auto-refresh`:**
   - Directional animated blue (inbound) and emerald (outbound) connection spotlighting, full-screen presentation mode, live background file watching, and safe Git hooks (`--install-hook`).

### Quick Install

```bash
# Google Antigravity
git clone https://github.com/Darshuse/floorplan-360.git ~/.gemini/config/skills/floorplan

# Claude Code
git clone https://github.com/Darshuse/floorplan-360.git ~/.claude/skills/floorplan

# Codex / Workspace-local
git clone https://github.com/Darshuse/floorplan-360.git .agents/skills/floorplan
```

Then simply ask your AI coding assistant:
> `"Draw an interactive floorplan of this codebase and open it in the browser"`

---

## 🔒 ضمانات الأمان والخصوصية (Security & Privacy Guarantees)

- **Zero External npm Packages:** يعمل بالكامل بمكتبات Node.js القياسية المدمجة فقط.
- **Strict SHA-256 CSP:** كل صفحة مبنية محمية بسياسة أمان صارمة تمنع أي سكربت خارجي.
- **حماية الأسرار المحلية:** الخادم يعمل حصرياً على `127.0.0.1` برمز أمان للجلسة، ويمنع قراءة ملفات `.env` أو المفاتيح الخاصة، ويقوم بإخفاء أي مفاتيح سرية تلقائياً.
- **نظافة مستودعك:** مجلد `floorplan/` داخل مشروعك يحتوي تلقائياً على `.gitignore` خاص به حتى لا يدخل في التزامات `git` الخاصة بمشروعك.

## Running Tests

```bash
# macOS / Linux
node --test tests/*.test.mjs

# Windows PowerShell
node --test (Get-ChildItem tests\*.test.mjs).FullName
```

## License & Credits

- **License:** [MIT](./LICENSE)
- **Original Skill Author:** [@haydenschmitty — haydenschmitty/floorplan](https://github.com/haydenschmitty/floorplan)
- **Floorplan 360 Architecture & Enhancements:** [@Darshuse — Darshuse/floorplan-360](https://github.com/Darshuse/floorplan-360)
