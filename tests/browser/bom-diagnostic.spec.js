const {test,expect}=require('@playwright/test');

test('connection test runs only on click, polls, and displays the saved result on reload',async({page})=>{
  let started=false, finished=false, posts=0;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/diagnostics/bom',async route=>{
    if(route.request().method()==='POST'){started=true;posts++;}
    const status=finished?'passed':started?'running':'not-started';
    const data={status,onRender:true,directoryReachable:finished,fileDownloaded:finished,formatValidated:finished,
      message:finished?'Passed: connection and format validated.':started?'Checking the BoM FTP directory…':'Ready. No requests yet.',
      ...(finished?{completedAt:'2026-10-22T03:00:00Z'}:{})};
    await route.fulfill({json:data});
    if(started)finished=true;
  });
  await page.goto('/diagnostics/bom');
  await expect(page.getByRole('button',{name:'Run connection test'})).toBeEnabled();
  expect(posts).toBe(0);
  await page.getByRole('button',{name:'Run connection test'}).click();
  await expect(page.getByRole('status')).toContainText('Passed:');
  await expect(page.locator('#completed')).toContainText('AEST');
  await expect(page.locator('#environment')).toHaveText('Yes');
  await expect(page.getByRole('button',{name:'Test completed'})).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Passed:');
  expect(posts).toBe(1);expect(errors).toEqual([]);
});

test('failed connection remains a failure and cannot be retriggered',async({page})=>{
  await page.route('**/api/diagnostics/bom',route=>route.fulfill({json:{status:'failed',onRender:false,
    directoryReachable:true,fileDownloaded:false,formatValidated:false,message:'Failed during download: the FTP request timed out.'}}));
  await page.goto('/diagnostics/bom');
  await expect(page.getByRole('status')).toContainText('Failed during download');
  await expect(page.locator('#directory')).toHaveText('Passed');
  await expect(page.locator('#download')).toHaveText('Not passed');
  await expect(page.locator('#environment')).toContainText('does not prove Render connectivity');
  await expect(page.getByRole('button',{name:'Test completed'})).toBeDisabled();
});
