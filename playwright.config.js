const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests/browser',use:{baseURL:'http://127.0.0.1:8000',launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']},viewport:{width:1440,height:1000}},reporter:'list'});
