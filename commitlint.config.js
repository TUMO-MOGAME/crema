/**
 * Conventional Commits, enforced on the `commit-msg` hook.
 *
 * The brief asks for a tidy history with a descriptive message per feature.
 * Enforcing the format in a hook is more reliable than intending to be tidy.
 *
 *   feat(api): add method filter to brew list
 *   fix(web): reset filter when the last matching brew is deleted
 *   chore(repo): pin node to 24 lts
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['repo', 'ci', 'api', 'web', 'shared', 'db', 'ai', 'docs', 'deps', 'test'],
    ],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 100],
    'subject-case': [2, 'always', 'lower-case'],
  },
};
