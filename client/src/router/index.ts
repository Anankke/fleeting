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
    // "/" and any unrecognised path go to /pilot (guard handles auth)
    { path: '/', redirect: '/pilot' },
    {
      path: '/pilot',
      component: () => import('@/pages/pilot/PilotDashboard.vue'),
      meta: { requiresAuth: true, roles: ['pilot'] },
    },
    {
      path: '/commander',
      component: () => import('@/pages/commander/CommanderDashboard.vue'),
      meta: { requiresAuth: true },
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

async function isServerHealthy(): Promise<boolean> {
  try {
    const res = await fetch('/health', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const user = await fetchMe();

    if (!user) {
      // Only redirect to SSO when backend is actually reachable.
      const healthy = await isServerHealthy();
      if (healthy) {
        window.location.href = '/auth/login';
      }
      // Abort this navigation either way; App.vue health gate handles offline state.
      return false;
    }

    const requiredRoles = to.meta.roles;
    if (requiredRoles && !requiredRoles.some((r) => user.roles.includes(r))) {
      // Authenticated but wrong role — fall back to pilot dashboard
      return '/pilot';
    }
  }

  return true;
});

export default router;
