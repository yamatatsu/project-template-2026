import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import { routeTree } from './router';

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

it('highlights the タスク nav item on /tasks', async () => {
  renderAt('/tasks');

  const tasksLink = await screen.findByRole('link', { name: 'タスク' });
  const usersLink = screen.getByRole('link', { name: 'ユーザー' });

  await waitFor(() => expect(tasksLink).toHaveAttribute('data-active'));
  expect(usersLink).not.toHaveAttribute('data-active');
});

it('highlights the ユーザー nav item on /users', async () => {
  renderAt('/users');

  const tasksLink = await screen.findByRole('link', { name: 'タスク' });
  const usersLink = screen.getByRole('link', { name: 'ユーザー' });

  await waitFor(() => expect(usersLink).toHaveAttribute('data-active'));
  expect(tasksLink).not.toHaveAttribute('data-active');
});

it('redirects the index route to /tasks', async () => {
  renderAt('/');

  const tasksLink = await screen.findByRole('link', { name: 'タスク' });
  await waitFor(() => expect(tasksLink).toHaveAttribute('data-active'));
});
