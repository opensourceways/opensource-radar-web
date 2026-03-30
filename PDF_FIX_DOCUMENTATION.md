# PDF乱码问题修复说明 / PDF Garbled Text Fix

## 问题描述 (Problem Description)

PDF导出时中文字符显示为乱码，因为jsPDF默认使用的helvetica字体不支持中文字符。

When exporting PDFs, Chinese characters appear garbled because jsPDF's default helvetica font doesn't support Chinese characters.

## 解决方案 (Solution)

添加了对中文字体（Noto Sans SC）的支持，通过以下方式加载：

Added support for Chinese font (Noto Sans SC) by loading it through:

1. **主CDN源** (Primary CDN): jsDelivr
2. **备用CDN源** (Fallback CDN): unpkg
3. **本地字体文件** (Local font file): `./fonts/NotoSansSC-normal.js`

## 技术实现 (Technical Implementation)

### 字体加载机制 (Font Loading Mechanism)

```javascript
// 1. 尝试从多个CDN源加载字体
// Try loading font from multiple CDN sources
loadChineseFont(pdf) -> tryLoadFont(url, pdf)

// 2. 成功加载后注册字体到jsPDF
// Register font with jsPDF after successful loading
pdf.addFileToVFS('NotoSansSC-Regular.ttf', window.NotoSansSCRegular);
pdf.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal');

// 3. 使用中文字体渲染文本
// Use Chinese font for text rendering
pdf.setFont('NotoSansSC', 'normal');
```

### 特性 (Features)

- ✅ 自动字体加载 (Automatic font loading)
- ✅ 多源备份 (Multiple fallback sources)
- ✅ 超时保护 (Timeout protection - 5 seconds)
- ✅ 优雅降级 (Graceful degradation to helvetica)
- ✅ 可选本地托管 (Optional local hosting)

## 使用方法 (Usage)

### 默认使用 (Default Usage)

无需配置，点击"Download PDF"按钮即可自动使用中文字体。

No configuration needed, just click "Download PDF" button to automatically use Chinese font.

### 本地托管字体 (Local Font Hosting)

如需更高可靠性，可以本地托管字体文件：

For better reliability, you can host the font file locally:

1. 下载并转换字体 (Download and convert font)
2. 保存到 `fonts/NotoSansSC-normal.js`
3. 详见 `fonts/README.md`

See `fonts/README.md` for detailed instructions.

## 测试 (Testing)

在支持中文的浏览器中：

In a browser with Chinese support:

1. 访问应用 (Visit the application)
2. 加载示例数据或上传Excel (Load sample data or upload Excel)
3. 点击"Download PDF" (Click "Download PDF")
4. 打开PDF检查中文显示 (Open PDF and verify Chinese text)

## 兼容性 (Compatibility)

- ✅ 支持所有现代浏览器 (All modern browsers)
- ✅ 支持离线使用（使用本地字体）(Offline use with local font)
- ✅ 向后兼容（失败时使用helvetica）(Backward compatible with helvetica fallback)

## 故障排除 (Troubleshooting)

### 中文仍然乱码 (Chinese still garbled)

1. 检查浏览器控制台错误 (Check browser console for errors)
2. 确认网络可访问CDN (Ensure CDN is accessible)
3. 尝试使用本地字体文件 (Try using local font file)

### 字体加载缓慢 (Font loading slow)

1. 字体文件较大 (3-8 MB)，首次加载需要时间
2. 建议使用本地托管以提高速度
3. 可考虑字体子集化以减小文件大小

Font file is large (3-8 MB), initial loading takes time. Consider local hosting or font subsetting.

## 相关文件 (Related Files)

- `js/app.js` - PDF生成逻辑 (PDF generation logic)
- `fonts/README.md` - 字体配置说明 (Font setup guide)
- `fonts/NotoSansSC-normal.js` - 本地字体占位符 (Local font placeholder)
