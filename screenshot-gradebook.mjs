import playwright from 'playwright';
const { chromium } = playwright;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// Set cookies for authentication
await context.addCookies([
  {
    name: 'pl2_access_as_administrator',
    value: 'active',
    domain: 'localhost',
    path: '/',
  },
]);

const url = 'http://localhost:3000/pl/course_instance/2/instructor/instance_admin/gradebook';
console.log('Navigating to:', url);

await page.goto(url);

// Wait for network to be idle
await page.waitForLoadState('networkidle');

// Wait a bit more for any client-side rendering
await page.waitForTimeout(2000);

// Take screenshot
await page.screenshot({
  path: '/tmp/gradebook-screenshot.png',
  fullPage: true,
});

console.log('Screenshot saved to /tmp/gradebook-screenshot.png');

// Check what's visible
const title = await page.title();
console.log('Page title:', title);

// Check for specific elements
const table = await page.locator('table').count();
console.log('Tables found:', table);

const component = await page.locator('[data-component="InstructorGradebookTable"]').count();
console.log('InstructorGradebookTable components:', component);

const cardHeader = await page.locator('.card-header:has-text("Gradebook")').count();
console.log('Gradebook card headers:', cardHeader);

// Check if there's any error message
const errorMsg = await page.locator('.alert-danger').textContent().catch(() => null);
if (errorMsg) {
  console.log('Error message:', errorMsg);
}

// Keep browser open for inspection
console.log('\nBrowser will stay open for 60 seconds for inspection...');
await page.waitForTimeout(60000);

await browser.close();
