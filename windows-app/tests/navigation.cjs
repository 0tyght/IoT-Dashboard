'use strict';
const sections={fleet:'workspace',overview:'workspace',monitor:'workspace',registers:'workspace',model:'workspace',history:'records',analysis:'records',motors:'library',templates:'library',settings:'settings',events:'settings'};
async function openPage(page,tab){
  await page.locator(`.app-nav [data-section="${sections[tab]}"]`).click();
  if(['monitor','registers'].includes(tab)){await page.locator('#tab-device').click();await page.locator(`.device-tabs [data-tab="${tab}"]`).click();}
  else await page.locator(`.context-tabs [data-tab="${tab}"]`).click();
}
module.exports={openPage};
