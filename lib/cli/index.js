/**
 * lib/cli/index.js · CLI 子命令路由 + 极简 arg parser
 *
 * 设计原则：
 *   - 零第三方依赖（不引 commander / minimist / mri）
 *   - 子命令只两个核心（init / doctor），加上 help / version / 缺省
 *   - 解析规则简单明确：
 *       * 第一个非 "-" 开头的 token 为子命令
 *       * --foo=bar / --foo bar / --foo（boolean）
 *       * -y 等单字符短 flag（仅识别预定义）
 *
 * 暴露：
 *   - run(argv): 入口函数，bin/auto-e2e.mjs 调用
 *   - parse(argv): 暴露解析器，便于 stage-2 单测
 */

'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

// 短 flag 别名表
const SHORT_ALIAS = {
  y: 'yes',
  h: 'help',
  v: 'version',
};

// 已知 boolean flag（无值）—— 解析时不消耗下一个 token
const BOOLEAN_FLAGS = new Set([
  'yes',
  'auto',
  'manual',
  'dry-run',
  'force',
  'skip-browsers',
  'skip-skill',
  'help',
  'version',
]);

/**
 * 解析 argv（已剔除 node 和脚本名）
 *
 * @param {string[]} argv
 * @returns {{ command: string|null, opts: object, positional: string[] }}
 */
function parse(argv) {
  const opts = {};
  const positional = [];
  let command = null;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    // --foo=bar / --foo bar / --foo
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eqIdx = body.indexOf('=');
      let key;
      let val;
      if (eqIdx >= 0) {
        key = body.slice(0, eqIdx);
        val = body.slice(eqIdx + 1);
      } else {
        key = body;
        if (BOOLEAN_FLAGS.has(key)) {
          val = true;
        } else {
          // 下一个 token 不是 flag 则当值
          const next = argv[i + 1];
          if (next != null && !next.startsWith('-')) {
            val = next;
            i += 1;
          } else {
            val = true;
          }
        }
      }
      opts[camelize(key)] = val;
      continue;
    }

    // -y / -h
    if (token.startsWith('-') && token.length > 1) {
      const short = token.slice(1);
      const long = SHORT_ALIAS[short];
      if (long) {
        opts[camelize(long)] = true;
      } else {
        // 未知短 flag：忽略并打告警，避免吞噪声
        logger.warn(`忽略未知短选项：${token}`);
      }
      continue;
    }

    // 位置参数：第一个作为 command
    if (command == null) {
      command = token;
    } else {
      positional.push(token);
    }
  }

  return { command, opts, positional };
}

function camelize(s) {
  return s.replace(/-([a-z])/g, (_m, ch) => ch.toUpperCase());
}

/**
 * 读取自身 package.json 的 version（用于 --version）
 */
function getVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  } catch (_e) {
    return 'unknown';
  }
}

/**
 * CLI 入口。bin/auto-e2e.mjs 转发到这里。
 *
 * @param {string[]} argv 已剔除 node 和脚本名
 */
async function run(argv) {
  const { command, opts } = parse(argv);

  // --version / -v：优先于一切
  if (opts.version) {
    // eslint-disable-next-line no-console
    console.log(getVersion());
    return 0;
  }

  // --help / -h，或没有任何参数
  if (opts.help || command == null) {
    const { showHelp } = require('./commands/help');
    showHelp();
    return 0;
  }

  try {
    switch (command) {
      case 'init': {
        const init = require('./commands/init');
        await init(opts);
        return 0;
      }
      case 'doctor': {
        const doctor = require('./commands/doctor');
        await doctor(opts);
        return 0;
      }
      case 'help': {
        const { showHelp } = require('./commands/help');
        showHelp();
        return 0;
      }
      default: {
        logger.error(`未知命令：${command}`);
        logger.hint(`跑 ${logger.c.cyan('npx s-auto-e2e-kit help')} 看可用命令`);
        return 2;
      }
    }
  } catch (err) {
    logger.error(err && err.message ? err.message : String(err));
    if (process.env.DEBUG && err && err.stack) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
    }
    return 1;
  }
}

module.exports = { run, parse, getVersion };
