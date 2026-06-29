// CloudFront Function (viewer-request) for the `/api/*` behavior.
// Strips the leading `/api` so the API Gateway / Hono app sees root paths
// (`/api/tasks` -> `/tasks`). This is what makes the API and the static site
// share a single CloudFront origin.
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\/api/, '');
  if (request.uri === '') {
    request.uri = '/';
  }
  return request;
}
