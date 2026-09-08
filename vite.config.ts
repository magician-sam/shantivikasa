import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(__dirname)}},build:{outDir:'dist-desktop',emptyOutDir:true,target:'chrome148'},base:'./'});
