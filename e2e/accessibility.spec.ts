import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility, measured against the real thing.
 *
 * The plan's acceptance criterion for this phase is "Lighthouse accessibility
 * ≥ 95". Lighthouse computes that score by running axe and weighting the rules
 * it breaks, so this asserts the same engine directly and gets two things a
 * score cannot give: it names the element and rule that failed, and it has no
 * threshold to hide behind. A score of 95 means something is wrong and the
 * number was rounded generously; zero violations means nothing is.
 *
 * Run against the production build over real HTTP, like the rest of this
 * directory, because a violation introduced by a build transform is exactly the
 * kind a jsdom test cannot see.
 *
 * Scoped to WCAG 2.2 A and AA, which is what the brief and the audit both
 * measure against. Best-practice rules are deliberately not gating: they are
 * advice, and a suite that fails on advice gets ignored.
 */
const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const analyse = (page: Page) => new AxeBuilder({ page }).withTags(STANDARD).analyze();

/** Names the rule and the element, so a failure is actionable from the log. */
function report(violations: Awaited<ReturnType<typeof analyse>>['violations']): string {
  return violations
    .map((violation) => {
      const where = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n    at ${where}`;
    })
    .join('\n');
}

test.describe('accessibility', () => {
  test('the brew log has no violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

    const { violations } = await analyse(page);

    expect(report(violations), report(violations)).toBe('');
  });

  /**
   * Dialogs are checked separately because they are a different document state
   * — focus is trapped, the background is inert, and the rules that apply to
   * required parent/child structure and name-role-value are the ones a modal
   * most often breaks.
   */
  test('the add form has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a brew' })).toBeVisible();

    const { violations } = await analyse(page);

    expect(report(violations), report(violations)).toBe('');
  });

  test('the delete confirmation has no violations', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: /^Edit / })
      .first()
      .click();
    await page
      .getByRole('dialog', { name: 'Edit a brew' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Delete this brew?' })).toBeVisible();

    const { violations } = await analyse(page);

    expect(report(violations), report(violations)).toBe('');
  });

  /**
   * The light theme is a different set of colours and therefore a different set
   * of contrast results. Checking only the default would leave half the design
   * system unmeasured — and it was the light theme that carried the worse
   * failures when these values were last measured by hand.
   */
  test('the light theme has no violations', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('crema:theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

    const { violations } = await analyse(page);

    expect(report(violations), report(violations)).toBe('');
  });

  /**
   * The empty state needs an empty log, and the seed does not provide one — it
   * uses all eight brew methods deliberately, so the coach has history to
   * answer from. Filtering therefore never empties the list, and the response
   * is intercepted instead. The data is stubbed; the page, the build and the
   * rendering are still the real ones.
   */
  test('the empty state has no violations', async ({ page }) => {
    await page.route('**/api/brews?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ brews: [], total: 0, limit: 50, offset: 0 }),
      });
    });

    await page.goto('/');
    await expect(page.getByText('Nothing logged yet.')).toBeVisible();

    const { violations } = await analyse(page);

    expect(report(violations), report(violations)).toBe('');
  });
});

/**
 * Keyboard reachability, which axe cannot judge.
 *
 * axe can see that a control has a name and a role; it cannot see whether you
 * can actually get to it with a keyboard, because that depends on order and on
 * what traps focus. This walks the page the way someone without a mouse would.
 */
test.describe('keyboard navigation', () => {
  test('reaches every control on the log without a mouse', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

    const reached = new Set<string>();

    // Bounded rather than "until it wraps": a focus trap on the page itself
    // would make an unbounded loop hang instead of fail.
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return null;
        return `${active.tagName}:${active.getAttribute('aria-label') ?? active.textContent?.trim().slice(0, 30) ?? ''}`;
      });
      if (label) reached.add(label);
    }

    const all = [...reached].join(' | ');
    expect(all).toContain('Theme');
    expect(all).toContain('Add');
    expect(all).toContain('SELECT');
    // The per-row edit controls are named for the brew they open.
    expect(all).toMatch(/Edit /);
  });

  test('closes a dialog with Escape and puts focus back', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Zimbabwean highlands' })).toBeVisible();

    const add = page.getByRole('button', { name: 'Add' });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Add a brew' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Add a brew' })).toBeHidden();

    // Focus returns to the control that opened it, rather than falling to the
    // top of the page — the defect this was fixed for.
    await expect(add).toBeFocused();
  });
});
