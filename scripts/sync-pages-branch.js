'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const gitDir = path.join(rootDir, '.git');

function runGit(args, extraEnv) {
  return execFileSync('git', args, {
    cwd: rootDir,
    env: Object.assign({}, process.env, extraEnv || {}),
    encoding: 'utf8'
  }).trim();
}

function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist/index.html not found. Run "node build-dist.js" first.');
  }
  if (!fs.existsSync(gitDir)) {
    throw new Error('.git directory not found in globe-app.');
  }

  const tmpIdx = path.join(os.tmpdir(), `wtg-pages-idx-${process.pid}-${Date.now()}`);
  try {
    const env = { GIT_INDEX_FILE: tmpIdx };
    runGit(['--git-dir', gitDir, '--work-tree', distDir, 'add', '--all', '--force'], env);
    const treeHash = runGit(['--git-dir', gitDir, 'write-tree'], env);
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const commitHash = runGit(
      ['--git-dir', gitDir, 'commit-tree', treeHash, '-m', `chore(pages): sync static dist (${stamp})`],
      env
    );
    runGit(['--git-dir', gitDir, 'update-ref', 'refs/heads/pages', commitHash]);
    console.log(`Synced orphan branch "pages" -> ${commitHash.slice(0, 7)} (tree ${treeHash.slice(0, 7)})`);
  } finally {
    if (fs.existsSync(tmpIdx)) {
      fs.unlinkSync(tmpIdx);
    }
  }
}

main();
