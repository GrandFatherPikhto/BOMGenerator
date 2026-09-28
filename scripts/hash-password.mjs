#!/usr/bin/env node
// Generate (or check) a password hash for `auth.json`.
//
//   npm run auth:hash                       # asks for the user name and password
//   npm run auth:hash -- --user denis       # asks only for the password
//   npm run auth:hash -- --verify '<hash>'  # checks a password against a hash
//
// The password is typed without echo. `--password` exists for scripted setups
// but it then lands in the shell history, so prefer the interactive prompt.
import readline from 'node:readline';

import { hashPassword, verifyPassword } from '../src/server/lib/password.js';

const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Read the whole of a piped stdin (no trailing newline). */
async function readPipedStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** Ask a visible question on a TTY. */
function readLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Ask for a password without echoing it. Falls back to reading stdin when it is
 * not a terminal (e.g. `echo -n secret | npm run auth:hash`).
 */
function readPassword(question) {
  if (!process.stdin.isTTY) {
    return readPipedStdin();
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);
    let value = '';

    const finish = (result) => {
      stdin.setRawMode(wasRaw);
      stdin.off('data', onData);
      stdin.pause();
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (buffer) => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          finish(value);
          return;
        }
        if (char === '\u0003') {
          finish('');
          reject(new Error('cancelled'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const verifyHash = argValue('--verify');
  if (verifyHash) {
    const password = argValue('--password') ?? (await readPassword('Пароль: '));
    const ok = verifyPassword(password, verifyHash);
    console.log(ok ? 'Пароль подходит.' : 'Пароль НЕ подходит.');
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const username = argValue('--user') ?? (await readLine('Имя пользователя: '));
  const password = argValue('--password') ?? (await readPassword('Пароль: '));

  if (!username || !password) {
    console.error('Нужны имя пользователя и пароль.');
    process.exitCode = 1;
    return;
  }

  const hash = hashPassword(password);
  console.log('\nДобавьте этого пользователя в auth.json:\n');
  console.log(JSON.stringify({ username, hash }, null, 2));
  console.log('\n(пароль в файле не хранится — только этот хеш)');
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
