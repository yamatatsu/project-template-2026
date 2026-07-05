// default（S3）behavior 用の CloudFront Function（viewer-request）。
// SPA を配信するためのもの: ディレクトリや拡張子のないパス（`/tasks/123` の
// ようなクライアントサイドルート）へのリクエストは `/index.html` に書き換える。
// 実ファイル（`.js`・`.css`・`.png` など）へのリクエストはそのまま通す。
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }

  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
