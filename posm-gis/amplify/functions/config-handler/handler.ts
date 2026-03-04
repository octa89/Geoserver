/**
 * Config Lambda handler — GET/POST /api/config
 *
 * GET ?username=X&workspace=Y  → return specific workspace config
 * GET ?username=X              → list all saved workspace names for user
 * POST { username, workspace, config } → upsert workspace config
 *
 * The config object is stored as a JSON string to avoid DynamoDB marshalling
 * limits with deeply nested objects (e.g. large valueColorMap in symbology).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

interface APIGatewayEvent {
  requestContext: { http: { method: string } };
  queryStringParameters?: Record<string, string>;
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
    console.error('Config handler error:', message, err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error', detail: message }),
    };
  }
};

async function handleGet(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const username = event.queryStringParameters?.username;
  const workspace = event.queryStringParameters?.workspace;

  if (!username) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing username parameter' }),
    };
  }

  if (workspace) {
    // Get specific workspace config
    const result = await client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: `CONFIG#${workspace}` },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Config not found' }),
      };
    }

    // Config is stored as a JSON string — parse it back for the client.
    // Also handle legacy items that stored config as a native Map.
    const config = typeof result.Item.configJson === 'string'
      ? JSON.parse(result.Item.configJson)
      : result.Item.config;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(config),
    };
  }

  // List all workspace configs for this user
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${username}`,
        ':prefix': 'CONFIG#',
      },
    })
  );

  const workspaces = (result.Items ?? []).map((item) => ({
    workspace: item.workspace,
    updatedAt: item.updatedAt,
  }));

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(workspaces),
  };
}

async function handlePost(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const body = JSON.parse(event.body ?? '{}');
  const { username, workspace, config } = body;

  if (!username || !workspace || !config) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing required fields: username, workspace, config' }),
    };
  }

  // Store config as a JSON string to avoid DynamoDB marshalling issues
  // with deeply nested objects (valueColorMap, etc.)
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${username}`,
        SK: `CONFIG#${workspace}`,
        username,
        workspace,
        configJson: JSON.stringify(config),
        updatedAt: new Date().toISOString(),
      },
    })
  );

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true }),
  };
}
