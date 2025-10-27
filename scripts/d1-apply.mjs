// scripts/d1-apply.mjs
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取 DB 名称（沿用你已有的 get-db-name.mjs）
const out = spawnSync(process.execPath, [resolve(__dirname, 'get-db-name.mjs')], {
  encoding: 'utf8',
});
if (out.status !== 0) {
  console.error(out.stderr || 'Failed to read DB name');
  process.exit(out.status ?? 1);
}
const dbName = out.stdout.trim();

// 是否带 --local
const useLocal = process.argv.includes('--local');

// 组装 wrangler 命令
const args = ['d1', 'migrations', 'apply', dbName];
if (useLocal) args.push('--local');

const res = spawnSync('wrangler', args, { stdio: 'inherit', shell: true });
process.exit(res.status ?? 0);
