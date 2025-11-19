import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/my_car/',   // относительные пути, работает локально
  plugins: [vue()]
})
