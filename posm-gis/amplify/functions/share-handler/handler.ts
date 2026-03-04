/**
 * Share Lambda handler — GET/POST /api/share
 *
 * POST { username, wsName, wsConfig } → create share, return { id, url }
 * GET /api/share/{shareId}            → return share snapshot (public, no auth)
 *
 * The wsConfig is stored as a JSON string to avoid DynamoDB marshalling
 * limits with deeply nested objects (e.g. large valueColorMap in symbology).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;
const SHARE_TTL_DAYS = 7;

interface APIGatewayEvent {
  requestContext: { http: { method: string } };
  pathParameters?: Record<string, string>;
  body?: string;
}

interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayResponse> => {
  const method = event.requestContext.http.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    if (method === 'GET') {
      return await handleGet(event);
    }
    if (method === 'POST') {
      return await handlePost(event);
    }
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Share handler error:', message, err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error', detail: message }),
    };
  }
};

async function handleGet(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const shareId = event.pathParameters?.shareId;

  if (!shareId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing shareId' }),
    };
  }

  const result = await client.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `SHARE#${shareId}`, SK: `SHARE#${shareId}` },
    })
  );

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Share not found or expired' }),
    };
  }

  // Config stored as JSON string (new) or native Map (legacy)
  const wsConfig = typeof result.Item.configJson === 'string'
    ? JSON.parse(result.Item.configJson)
    : result.Item.wsConfig;

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      shareId: result.Item.shareId,
      wsName: result.Item.wsName,
      wsConfig,
      createdAt: result.Item.createdAt,
      createdBy: result.Item.createdBy,
    }),
  };
}

async function handlePost(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const body = JSON.parse(event.body ?? '{}');
  const { username, wsName, wsConfig } = body;

  if (!username || !wsName || !wsConfig) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing required fields: username, wsName, wsConfig' }),
    };
  }

  const shareId = randomBytes(4).toString('hex'); // 8-char hex ID
  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + SHARE_TTL_DAYS * 86400;

  // Store config as JSON string to avoid DynamoDB marshalling issues
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SHARE#${shareId}`,
        SK: `SHARE#${shareId}`,
        shareId,
        createdBy: username,
        wsName,
        configJson: JSON.stringify(wsConfig),
        createdAt: now.toISOString(),
        ttl,
      },
    })
  );

  return {
    statusCode: 201,
    headers: CORS_HEADERS,
    body: JSON.stringify({ id: shareId, url: `/share/${shareId}` }),
  };
}
