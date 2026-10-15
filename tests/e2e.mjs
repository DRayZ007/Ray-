import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(projectRoot, relativePath);

      if (!filePath.startsWith(projectRoot)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, content) => {
        if (error) {
          response.writeHead(404);
          response.end('Not found');
          return;
        }

        const type = filePath.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : filePath.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : filePath.endsWith('.js')
              ? 'text/javascript; charset=utf-8'
              : 'application/octet-stream';

        response.writeHead(200, { 'Content-Type': type });
        response.end(content);
      });
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function run() {
  const browserPath = findBrowser();

  if (!browserPath) {
    throw new Error('No supported Chromium browser was found for the E2E test.');
  }

  const server = await startServer();
  const port = server.address().port;
  const appUrl = `http://127.0.0.1:${port}/index.html?ui-test`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-notes-e2e-'));
  const stdoutPath = path.join(userDataDir, 'dom.html');

  try {
    const result = await new Promise((resolve, reject) => {
      const stdoutFd = fs.openSync(stdoutPath, 'w');
      const child = spawn(
        browserPath,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--dump-dom',
          `--user-data-dir=${userDataDir}`,
          appUrl
        ],
        {
          stdio: ['ignore', stdoutFd, 'pipe'],
          windowsHide: true
        }
      );

      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Browser test timed out.'));
      }, 20000);

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.once('error', (error) => {
        clearTimeout(timeout);
        fs.closeSync(stdoutFd);
        reject(error);
      });

      child.once('exit', (code) => {
        clearTimeout(timeout);
        fs.closeSync(stdoutFd);
        resolve({ code, stderr });
      });
    });

    if (result.code !== 0) {
      throw new Error(`Browser exited with status ${result.code}: ${result.stderr}`);
    }

    const html = fs.readFileSync(stdoutPath, 'utf8');

    if (!html.includes('data-ui-test="pass"')) {
      const message = html.match(/id="ui-test-result"[^>]*>([\s\S]*?)<\/output>/);
      throw new Error(message ? message[1].trim() : 'Browser UI test did not pass.');
    }

    if (!html.includes('data-testid="note-list"') || !html.includes('data-testid="editor"')) {
      throw new Error('Expected application shell markup was not rendered.');
    }

    console.log('E2E passed: UI test completed in a real Chromium browser.');
  } finally {
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
