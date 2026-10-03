import { defineConfig, loadEnv } from 'vite';
import report from './api/daily-report.js';
import assistant from './api/assistant.js';
export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'');
  for(const [key,value] of Object.entries(env)) if(process.env[key]===undefined)process.env[key]=value;
  return {plugins:[{name:'vk-dev-api',configureServer(server){server.middlewares.use('/api/daily-report',report);server.middlewares.use('/api/assistant',assistant);}}]};
});
