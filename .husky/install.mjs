/**
 * Installs the git hooks, except where there are no git hooks to install.
 *
 * `prepare` runs on every `npm install`, including the one a deploy does. Two
 * things are true there and not here: `NODE_ENV=production` makes npm skip
 * devDependencies, so the `husky` binary is not on disk; and there is no
 * working tree to commit from, so hooks would do nothing even if it were. The
 * previous `"prepare": "husky"` met that with `husky: command not found` and
 * exit 127, which npm reports as a failed install and Vercel as a failed build
 * — a deploy stopped by a tool whose entire job is to run before commits.
 *
 * Written as a Node script rather than a shell guard because npm runs scripts
 * through `cmd.exe` on Windows and `sh` elsewhere, and a conditional that works
 * in one is a syntax error in the other. Node is the one interpreter guaranteed
 * to be present wherever npm is.
 *
 * The import is dynamic and below the exit for the same reason the exit exists:
 * in production the package is not there to import.
 */
if (process.env.NODE_ENV === 'production' || process.env.CI) {
  process.exit(0);
}

const husky = (await import('husky')).default;
console.log(husky());
