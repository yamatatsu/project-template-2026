import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { client } from '@/lib/api';

function useHelloWorld() {
  return useQuery({
    queryKey: ['hello-world'],
    queryFn: async () => {
      const res = await client['hello-world'].$get();
      if (!res.ok) throw new Error('Failed to fetch hello world');
      return res.json();
    },
  });
}

export function App() {
  const { data, isPending, isError, refetch, isFetching } = useHelloWorld();

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Message from the backend</CardTitle>
          <CardDescription>
            Fetched via the typed Hono RPC client and TanStack Query.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-2xl font-semibold" data-testid="message">
            {isPending ? 'Loading…' : isError ? 'Error loading message' : data.message}
          </p>
          <Button onClick={() => refetch()} disabled={isFetching} className="self-start">
            {isFetching ? 'Refreshing…' : 'Refetch'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
