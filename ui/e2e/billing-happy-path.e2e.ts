import { test, expect } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD, setupEmulatorState } from './global-setup';

test.beforeAll(async () => {
	await setupEmulatorState();
});

// 2A.3 — the money-critical happy path, run against the Firebase emulators
// (decisions/20260611_emulator-for-e2e-testing.md):
//
//   login -> create meter group -> property -> reading (prev month) ->
//   reading (this month, auto-billing fires) -> create billing cycle
//   (validation passes) -> mark billing paid -> assert displayed total
//   matches Phase-1 rounding (decimal.js half-up to 2dp).
//
// Run: `npm run test:e2e` from `ui/`.

const RUN_ID = Date.now().toString(36);
const METER_NAME = `E2E Electricity ${RUN_ID}`;
const ROOM_NAME = `E2E Unit ${RUN_ID}`;
const RATE = 12.5; // pesos per kWh
const PREV_READING = 100;
const CURR_READING = 150; // consumption = 50 -> 50 * 12.5 = 625.00

function ymd(d: Date): string {
	return d.toISOString().slice(0, 10);
}

const now = new Date();
// Asia/Manila calendar months: previous reading must fall in the calendar month
// immediately before the current reading for auto-billing to fire.
// Day 1 keeps both dates safely in the past (reading_date cannot be in the future).
const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const currMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

test('billing happy path: reading auto-creates billing, cycle validates, mark paid shows rounded total', async ({
	page
}) => {
	page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
	page.on('pageerror', (err) => console.log('[pageerror]', err));
	page.on('requestfailed', (req) =>
		console.log('[reqfailed]', req.url(), req.failure()?.errorText)
	);
	page.on('response', async (res) => {
		const url = res.url();
		if (/\/(readings|billings)(\?|$)/.test(url) && res.request().method() === 'GET') {
			try {
				console.log('[resp]', url, await res.text());
			} catch {
				/* ignore */
			}
		}
	});

	// --- Login ---
	await page.goto('/login');
	await page.getByLabel('Email').fill(E2E_EMAIL);
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: /log in/i }).click();
	await expect(page).toHaveURL(/\/dashboard/);

	// --- Create meter group ---
	await page.goto('/meter-groups');
	await page.getByRole('button', { name: 'Create new meter group' }).click();
	await page.getByLabel('Meter Name').fill(METER_NAME);
	await page.getByLabel('Utility Type').selectOption('electricity');
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.getByText(METER_NAME)).toBeVisible();

	// --- Create property, wired to the new meter group as its main meter ---
	await page.goto('/properties');
	await page.getByTitle('Create new property').click();
	await page.getByLabel('Room Name').fill(ROOM_NAME);
	await page.getByLabel('Tenant Amount').fill('1');
	await page.getByLabel('Electricity Meter Group').selectOption({ label: METER_NAME });
	await page.getByLabel('Main Meter (Electricity)').check();
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.getByText(ROOM_NAME).first()).toBeVisible();

	// --- Reading 1: previous month (baseline, no auto-billing) ---
	await page.goto('/readings');
	await page.getByRole('button', { name: 'Create new reading' }).click();
	await page.getByRole('button', { name: 'Manual' }).click();
	await page.getByLabel('Meter Group *').selectOption({ label: `${METER_NAME} (electricity)` });
	await page.getByLabel('Property *').selectOption({ label: ROOM_NAME });
	await page.getByLabel('Reading Amount *').fill(String(PREV_READING));
	await page.getByLabel('Reading Date *').fill(ymd(prevMonthDate));
	await page.getByRole('button', { name: 'Create Reading' }).click();
	await expect(page.getByText('Create Reading')).toBeHidden({ timeout: 15_000 });

	// --- Reading 2: this month -> triggers auto-billing ---
	await page.getByRole('button', { name: 'Create new reading' }).click();
	await page.getByRole('button', { name: 'Manual' }).click();
	await page.getByLabel('Meter Group *').selectOption({ label: `${METER_NAME} (electricity)` });
	await page.getByLabel('Property *').selectOption({ label: ROOM_NAME });
	await page.getByLabel('Reading Amount *').fill(String(CURR_READING));
	await page.getByLabel('Reading Date *').fill(ymd(currMonthDate));
	await page.getByRole('button', { name: 'Create Reading' }).click();
	await expect(page.getByText('Create Reading')).toBeHidden({ timeout: 15_000 });

	console.log('END_DATE_SENT', ymd(currMonthDate), 'now=', now.toISOString());

	// --- Create billing cycle: discovery should find the auto-created billing ---
	await page.goto('/billings');
	await page.getByRole('button', { name: 'Create new billing cycle' }).click();
	await page.getByLabel('Meter Group').selectOption({ label: `${METER_NAME} (electricity)` });
	// Force discovery's end-date month to match the current reading's month (UTC), regardless
	// of the form's auto-calculated default (which can land on an adjacent month near
	// month boundaries / timezone offsets).
	await page.getByLabel('End Date').fill(ymd(currMonthDate));
	await page.getByLabel(/Billing Rate/).fill(String(RATE));
	await page.getByLabel(/Total Consumption/).fill(String(CURR_READING - PREV_READING));

	// Discovery found our property's auto-created billing for this period.
	await expect(page.getByText(ROOM_NAME).first()).toBeVisible();
	await expect(page.getByLabel('Total Bill Amount')).toHaveValue('625');

	const createCycleButton = page.getByRole('button', { name: 'Create Cycle' });
	await expect(createCycleButton).toBeEnabled();
	await createCycleButton.click();
	await expect(page.getByRole('button', { name: 'New Billing Cycle' })).toBeHidden({
		timeout: 15_000
	});

	// --- Expand the new cycle and mark its billing paid ---
	await expect(page.getByText('₱625.00')).toBeVisible();
	await page.getByText(`1 billing record`).click();
	await page.getByRole('button', { name: 'Mark as paid' }).click();

	// Cycle's "Currently Paid" reflects the rounded total (Phase-1 money discipline).
	await expect(page.getByText('Currently Paid')).toBeVisible();
	const paidCell = page
		.locator('div')
		.filter({ hasText: /^Currently Paid$/ })
		.locator('xpath=following-sibling::div[1]');
	await expect(paidCell).toHaveText('₱625.00');
});
