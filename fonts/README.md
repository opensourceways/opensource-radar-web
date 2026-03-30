# Chinese Font for PDF Generation

This directory is intended to contain the Chinese font file for PDF generation.

## Quick Setup (Recommended)

The application will automatically try to load the Chinese font from CDN sources. No manual setup is required for basic usage.

## Local Font Setup (Optional)

If you want to host the font file locally for better reliability:

1. Download Noto Sans SC Regular font from [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+SC)

2. Convert the font to jsPDF format using the font converter:
   - Visit: https://peckconsulting.s3.amazonaws.com/fontconverter/fontconverter.html
   - Upload the `NotoSansSC-Regular.ttf` file
   - Set font name to: `NotoSansSC`
   - Set style to: `normal`
   - Click "Create" and download the generated `.js` file

3. Save the generated file as `NotoSansSC-normal.js` in this directory

4. The application will automatically use the local font file as a fallback

## Font Subsetting (Advanced)

To reduce file size, you can create a subset containing only the characters you need:

1. Use a font subsetting tool like [fonttools](https://github.com/fonttools/fonttools):
   ```bash
   pip install fonttools
   pyftsubset NotoSansSC-Regular.ttf \
     --unicodes="U+4E00-U+9FFF" \  # Common Chinese characters
     --output-file="NotoSansSC-Regular-subset.ttf"
   ```

2. Convert the subset font using the jsPDF font converter

3. Replace `NotoSansSC-normal.js` with the subset version

## Troubleshooting

- If Chinese characters appear garbled in PDFs, check browser console for font loading errors
- Ensure the font file is properly converted for jsPDF (not a regular TTF file)
- The font file should define `window.NotoSansSCRegular` variable
- Font file size is typically 3-8 MB for full font, or 1-3 MB for subset

## CDN Sources

The application automatically tries these CDN sources in order:
1. jsDelivr (primary)
2. unpkg (fallback)
3. Local file (if available)
