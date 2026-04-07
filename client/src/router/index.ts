import { createRouter, createWebHistory } from 'vue-router';
import { getMe, type MeResponse } from '@/api/client';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    roles?: string[];
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    {
      path: '/login',
      component: () => import('@/pages/login/LoginPage.vue'),
    },
    {
      path: '/pilot',
      component: () => import('@/pages/pilot/PilotDashboard.vue'),
      meta: { requiresAuth: true, roles: ['pilot'] },
    },
    {
      path: '/commander',
      component: () => import('@/pages/commander/CommanderDashboard.vue'),
      meta: { requiresAuth: true, roles: ['fc', 'war_commander'] },
    },
    {
      path: '/history',
      component: () => import('@/pages/history/HistoryPage.vue'),
      meta: { requiresAuth: true, roles: ['fc', 'war_commander'] },
    },
  ],
});

// Module-level cache cleared on logout via clearMeCache()
let meCache: MeResponse | null | undefined = undefined;

export function clearMeCache(): void {
  meCache = undefined;
}

async function fetchMe(): Promise<MeResponse | null> {
  if (meCache !== undefined) return meCache;
  try {
    meCache = await getMe();
  } catch {
    meCache = null;
  }
  return meCache;
}

router.beforeEach(async (to) => {
  const user = await fetchMe();

  if (to.path === '/login') {
    // Already authenticated — skip login and go to pilot
    return user ? '/pilot' : true;
  }

  if (to.meta.requiresAuth) {
    if (!user) return '/login';

    const requiredRoles = to.meta.roles;
    if (requiredRoles && !requiredRoles.some((r) => user.roles.includes(r))) {
      // Authenticated but wrong role — fall back to pilot dashboard
      return '/pilot';
    }
  }

  return true;
});

export default router;
