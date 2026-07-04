#!/bin/sh
# DynamoDB Local のセッションテーブルを作成する（冪等）。
# docker-compose の dynamodb-init（ワンショット）サービスから実行される。
# 本番はこのテーブルを CDK（apps/iac）が作成する。
set -eu

ENDPOINT="http://dynamodb:8000"
TABLE="${SESSION_TABLE_NAME:-sessions}"

# DynamoDB Local が応答するまで待つ（healthcheck に依存せずここでリトライ）。
until aws dynamodb list-tables --endpoint-url "$ENDPOINT" >/dev/null 2>&1; do
  echo "waiting for DynamoDB Local at $ENDPOINT ..."
  sleep 1
done

if aws dynamodb describe-table --table-name "$TABLE" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
  echo "Table \"$TABLE\" already exists."
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$ENDPOINT"

aws dynamodb wait table-exists --table-name "$TABLE" --endpoint-url "$ENDPOINT"

aws dynamodb update-time-to-live \
  --table-name "$TABLE" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --endpoint-url "$ENDPOINT"

echo "Created table \"$TABLE\" (TTL on \"ttl\") at $ENDPOINT."
