import type { CanvasElement } from '@mesh/shared-types';
import { generateSmoothBezierPath } from '../math/bezier';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function computeBoundingBox(elements: CanvasElement[], padding = 40) {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, width: 800, height: 600, maxX: 800, maxY: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.isDeleted) continue;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);

    if (el.type === 'path' && el.points) {
      for (const [px, py] of el.points) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, width: 800, height: 600, maxX: 800, maxY: 600 };
  }

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(100, maxX - minX),
    height: Math.max(100, maxY - minY)
  };
}

export function generateSvgContent(elements: CanvasElement[], isDark: boolean): string {
  const { minX, minY, width, height } = computeBoundingBox(elements);
  const bgColor = isDark ? '#0c0e12' : '#fbfbfa';

  const elementSvgNodes = elements
    .filter((el) => !el.isDeleted)
    .map((el) => {
      const stroke = el.strokeColor === '#0f172a' && isDark
        ? '#f1f5f9'
        : el.strokeColor === '#f1f5f9' && !isDark
        ? '#0f172a'
        : el.strokeColor;

      const fill = el.fillColor || 'transparent';
      const strokeWidth = el.strokeWidth || 2;

      switch (el.type) {
        case 'rectangle':
          return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="4" />`;

        case 'ellipse': {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const rx = Math.max(1, el.width / 2);
          const ry = Math.max(1, el.height / 2);
          return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
        }

        case 'diamond': {
          const top = `${el.x + el.width / 2},${el.y}`;
          const right = `${el.x + el.width},${el.y + el.height / 2}`;
          const bottom = `${el.x + el.width / 2},${el.y + el.height}`;
          const left = `${el.x},${el.y + el.height / 2}`;
          return `<polygon points="${top} ${right} ${bottom} ${left}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
        }

        case 'text': {
          const fontSize = el.fontSize || 18;
          const escaped = escapeXml(el.text || 'Text');
          const fontColor = stroke;
          return `<text x="${el.x}" y="${el.y + fontSize}" fill="${fontColor}" font-size="${fontSize}" font-family="Inter, sans-serif" font-weight="500">${escaped}</text>`;
        }

        case 'path': {
          const pathData = generateSmoothBezierPath(el.points || []);
          return `<path d="${pathData}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
        }

        case 'sticky': {
          const stickyBg = el.colorTone === 'rose'
            ? (isDark ? '#881337' : '#ffe4e6')
            : el.colorTone === 'sage'
            ? (isDark ? '#064e3b' : '#dcfce7')
            : el.colorTone === 'slate'
            ? (isDark ? '#1e293b' : '#f1f5f9')
            : (isDark ? '#78350f' : '#fef3c7');
          const stickyText = escapeXml(el.text || '');
          const textColor = isDark ? '#f1f5f9' : '#0f172a';
          return `
            <g transform="rotate(1.5 ${el.x + el.width / 2} ${el.y + el.height / 2})">
              <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${stickyBg}" rx="8" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
              <text x="${el.x + 12}" y="${el.y + 24}" fill="${textColor}" font-size="14" font-family="Inter, sans-serif">${stickyText}</text>
            </g>
          `;
        }

        case 'card': {
          const cardBg = isDark ? '#181b24' : '#ffffff';
          const cardBorder = isDark ? '#272b37' : '#e2e8f0';
          const textColor = isDark ? '#f1f5f9' : '#0f172a';
          const title = escapeXml(el.title || '');
          const body = escapeXml(el.markdownBody || '');
          return `
            <g>
              <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5" rx="8" />
              <text x="${el.x + 16}" y="${el.y + 28}" fill="${textColor}" font-size="16" font-weight="600" font-family="Inter, sans-serif">${title}</text>
              <line x1="${el.x}" y1="${el.y + 40}" x2="${el.x + el.width}" y2="${el.y + 40}" stroke="${cardBorder}" stroke-width="1" />
              <text x="${el.x + 16}" y="${el.y + 60}" fill="${textColor}" font-size="13" font-family="Inter, sans-serif">${body}</text>
            </g>
          `;
        }

        case 'connector': {
          return `<line x1="${el.x}" y1="${el.y}" x2="${el.x + el.width}" y2="${el.y + el.height}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="4 4" />`;
        }

        default:
          return '';
      }
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}" />
  ${elementSvgNodes}
</svg>`;
}

export function exportToSvg(elements: CanvasElement[], isDark: boolean, roomId = 'demo'): void {
  const svgString = generateSvgContent(elements, isDark);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `canvas-${roomId}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToPng(elements: CanvasElement[], isDark: boolean, roomId = 'demo'): Promise<void> {
  const svgString = generateSvgContent(elements, isDark);
  const { width, height } = computeBoundingBox(elements);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const scale = 2; // Retina 2x sharpness
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to create canvas 2d context'));
        return;
      }

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          reject(new Error('Failed to generate PNG blob'));
          return;
        }

        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `canvas-${roomId}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}
