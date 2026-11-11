import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';

await mkdir('artifacts', { recursive: true });
const source = await readFile('client/src/Portrait.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
}).outputText;
await writeFile('artifacts/portrait-preview.mjs', compiled);
const { CourtPortrait } = await import(pathToFileURL(path.resolve('artifacts/portrait-preview.mjs')));
const portraits = ['judge', 'prosecutor', 'defender'].map((role, i) =>
  `<div><div class="portrait">${renderToStaticMarkup(React.createElement(CourtPortrait, { role }))}</div><p>${['판사', '검사', '변호사'][i]}</p></div>`,
).join('');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 840, height: 360 }, deviceScaleFactor: 2 });
  await page.setContent(`<html lang="ko"><meta charset="utf-8"><style>body{margin:0;background:#f8f6f0;font-family:"Malgun Gothic",sans-serif;display:flex;align-items:center;justify-content:center;gap:46px;height:360px}.portrait{width:200px;height:250px;border-radius:90px 90px 10px 10px;background:#eeeee4;overflow:hidden}.portrait svg{width:100%;height:100%}p{text-align:center;font-size:14px;color:#47524b;margin:14px 0 0}</style>${portraits}</html>`);
  await page.screenshot({ path: 'artifacts/characters-preview.png' });
} finally {
  await browser.close();
}
console.log('artifacts/characters-preview.png');
