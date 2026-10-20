import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['src/main.tsx'], bundle: true, write: false,
  outfile: 'offline.js', format: 'iife', platform: 'browser', target: 'es2022',
  minify: true, define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
});
const js = result.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = result.outputFiles.find(f => f.path.endsWith('.css')).text;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#197565"><title>交前看一眼 · 离线即用版</title><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
await writeFile('打开即用.html', html);
console.log('已生成 打开即用.html：所有脚本、样式和 ZIP 库已内嵌，无需服务器或网络。');
