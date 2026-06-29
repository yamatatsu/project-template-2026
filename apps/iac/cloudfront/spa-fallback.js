// CloudFront Function (viewer-request) for the default (S3) behavior.
// Serves a single-page app: requests for a directory or an extensionless path
// (client-side routes like `/tasks/123`) are rewritten to `/index.html`.
// Requests for real files (`.js`, `.css`, `.png`, ...) pass through unchanged.
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
