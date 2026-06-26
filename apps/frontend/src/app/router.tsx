import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { TaskDetailPage } from '@/pages/task-detail';
import { TaskEditPage } from '@/pages/task-edit';
import { TaskNewPage } from '@/pages/task-new';
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

const taskNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks/new',
  component: TaskNewPage,
});

const taskDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks/$taskId',
  component: TaskDetailPage,
});

const taskEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks/$taskId/edit',
  component: TaskEditPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: UsersPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  tasksRoute,
  taskNewRoute,
  taskDetailRoute,
  taskEditRoute,
  usersRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
