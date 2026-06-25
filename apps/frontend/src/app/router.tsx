import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { TasksPage } from '@/pages/tasks';
import { UsersPage } from '@/pages/users';

import { AppLayout } from './app-layout';

const rootRoute = createRootRoute({
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/tasks' });
  },
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: UsersPage,
});

export const routeTree = rootRoute.addChildren([indexRoute, tasksRoute, usersRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
