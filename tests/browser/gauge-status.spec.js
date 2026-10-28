const {test,expect}=require('@playwright/test');
const row=(name,status,kind='water-summary')=>({name,status,kind,station:'bom:540111',group:'Test group',stationType:'Automatic',lastValidAt:'2026-10-22T05:00:00Z',lastReportedAt:'2026-10-22T05:00:00Z',lastCheckedAt:'2026-10-22T06:00:00Z',ageMinutes:60,reason:'Test-only observation-age fixture.'});
test('report filters statuses, accepts age limits and never shows rapid-change alarms',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let requested;
  await page.route('**/api/gauge-health?*',route=>{
    requested=new URL(route.request().url());
    return route.fulfill({json:{archiveAvailable:true,generatedAt:'2026-10-22T06:00:00Z',collectorRun:{status:'ok',started_at:'2026-10-22T05:59:00Z',finished_at:'2026-10-22T06:00:00Z'},rows:[row('Suspect gauge','suspect'),row('Out gauge','out'),row('Rain gauge','current','rain-15m')]}});
  });
  await page.goto('/gauge-status');
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await expect(page.locator('#connection')).toContainText('Connected to the saved');
  await expect(page.locator('#rows tr').first()).toContainText('Out gauge');
  await page.locator('#status').selectOption('suspect');await expect(page.locator('#rows tr')).toHaveCount(1);
  await page.locator('#status').selectOption('');await page.locator('#metric').selectOption('rain-15m');await expect(page.locator('#rows tr')).toHaveCount(1);
  await page.locator('#suspect').fill('90');await page.getByRole('button',{name:'Apply age limits'}).click();
  await expect.poll(()=>requested.searchParams.get('suspect')).toBe('90');
  await expect(page.locator('#asof')).toContainText('90 min / 6 hours');
  expect(errors).toEqual([]);
});
test('missing archive is clearly distinguished from gauge failures',async({page})=>{
  await page.route('**/api/gauge-health?*',route=>route.fulfill({json:{archiveAvailable:false,archiveReason:'not-connected',generatedAt:'2026-10-22T06:00:00Z',collectorRun:null,rows:[row('Unverified gauge','unverified','rain-15m')]}}));
  await page.goto('/gauge-status');
  await expect(page.locator('#connection')).toContainText('Archive connection pending');
  await expect(page.locator('#collector')).toContainText('unavailable');
  await expect(page.locator('#rows')).toContainText('Unverified');
});
