import { createRouter, createWebHistory } from 'vue-router'
import MapView from './views/MapView.vue'
import Settings from './views/Settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MapView },
    { path: '/settings', component: Settings },
  ],
})

export default router
