// `/api/*` behavior 用の CloudFront Function（viewer-request）。
// 先頭の `/api` を取り除き、API Gateway / Hono アプリにはルートパスが見えるように
// する（`/api/tasks` -> `/tasks`）。これによって API と静的サイトが単一の
// CloudFront オリジンを共有できる。
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\/api/, '');
  if (request.uri === '') {
    request.uri = '/';
  }
  return request;
}
