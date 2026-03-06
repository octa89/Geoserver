/**
 * Auth Lambda handler — manages users, groups, and password hashes in DynamoDB.
 *
 * DynamoDB access patterns (same posm-gis table):
 *   PK=AUTH#GLOBAL  SK=AUTH#USERS      → all users array
 *   PK=AUTH#GLOBAL  SK=AUTH#GROUPS     → all groups array
 *   PK=AUTH#GLOBAL  SK=AUTH#PASSWORDS  → password hash map
 *
 * Routes:
 *   GET  /api/auth/data   → { users, groups } (never returns passwords)
 *   POST /api/auth/data   → upsert { users?, groups?, passwords? }
 *   POST /api/auth/login  → validate { username, passwordHash }, return user or 401
 *   POST /api/auth/init   → seed default admin if DynamoDB is empty
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
  requestContext: { http: { method: string; path: string } };
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

function ok(data: unknown): APIGatewayResponse {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function err(statusCode: number, error: string): APIGatewayResponse {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify({ error }) };
}

// Default seed data
const DEFAULT_ADMIN_HASH = 'a]_PLACEHOLDER_'; // Will be computed at init time
const DEFAULT_USERS = [
  { username: 'admin', displayName: 'Administrator', city: '', groups: ['all_access'], role: 'admin' },
];
const DEFAULT_GROUPS = [
  { id: 'all_access', label: 'Full Access', workspaces: ['__ALL__'] },
];

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayResponse> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    // Route: /api/auth/data
    if (path.endsWith('/auth/data')) {
      if (method === 'GET') return await handleGetData();
      if (method === 'POST') return await handlePostData(event);
    }

    // Route: /api/auth/login
    if (path.endsWith('/auth/login') && method === 'POST') {
      return await handleLogin(event);
    }

    // Route: /api/auth/init
    if (path.endsWith('/auth/init') && method === 'POST') {
      return await handleInit(event);
    }

    return err(404, 'Not found');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Auth handler error:', message, e);
    return err(500, 'Internal server error');
  }
};

// ---------------------------------------------------------------------------
// GET /api/auth/data — fetch users + groups (never passwords)
// ---------------------------------------------------------------------------
async function handleGetData(): Promise<APIGatewayResponse> {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'AUTH#GLOBAL' },
    })
  );

  let users: unknown[] = [];
  let groups: unknown[] = [];

  for (const item of result.Items ?? []) {
    if (item.SK === 'AUTH#USERS' && typeof item.dataJson === 'string') {
      users = JSON.parse(item.dataJson);
    } else if (item.SK === 'AUTH#GROUPS' && typeof item.dataJson === 'string') {
      groups = JSON.parse(item.dataJson);
    }
    // Intentionally skip AUTH#PASSWORDS — never sent to client
  }

  return ok({ users, groups });
}

// ---------------------------------------------------------------------------
// POST /api/auth/data — upsert users, groups, and/or passwords
// ---------------------------------------------------------------------------
async function handlePostData(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const body = JSON.parse(event.body ?? '{}');
  const { users, groups, passwords } = body;
  const now = new Date().toISOString();
  const promises: Promise<unknown>[] = [];

  if (users !== undefined) {
    promises.push(client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: 'AUTH#GLOBAL', SK: 'AUTH#USERS', dataJson: JSON.stringify(users), updatedAt: now },
    })));
  }

  if (groups !== undefined) {
    promises.push(client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: 'AUTH#GLOBAL', SK: 'AUTH#GROUPS', dataJson: JSON.stringify(groups), updatedAt: now },
    })));
  }

  if (passwords !== undefined) {
    promises.push(client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: 'AUTH#GLOBAL', SK: 'AUTH#PASSWORDS', dataJson: JSON.stringify(passwords), updatedAt: now },
    })));
  }

  await Promise.all(promises);
  return ok({ success: true });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login — validate credentials server-side
// ---------------------------------------------------------------------------
async function handleLogin(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const body = JSON.parse(event.body ?? '{}');
  const { username, passwordHash } = body;

  if (!username || !passwordHash) {
    return err(400, 'Missing username or passwordHash');
  }

  // Fetch passwords and users in parallel
  const [pwResult, usersResult] = await Promise.all([
    client.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: 'AUTH#GLOBAL', SK: 'AUTH#PASSWORDS' },
    })),
    client.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: 'AUTH#GLOBAL', SK: 'AUTH#USERS' },
    })),
  ]);

  // Validate password
  const passwords: Record<string, string> = pwResult.Item?.dataJson
    ? JSON.parse(pwResult.Item.dataJson)
    : {};

  if (!passwords[username] || passwords[username] !== passwordHash) {
    return err(401, 'Invalid credentials');
  }

  // Find user object
  const users: Array<{ username: string; [key: string]: unknown }> = usersResult.Item?.dataJson
    ? JSON.parse(usersResult.Item.dataJson)
    : [];

  const user = users.find(u => u.username === username);
  if (!user) {
    return err(401, 'User not found');
  }

  return ok({ user });
}

// ---------------------------------------------------------------------------
// POST /api/auth/init — seed default admin if DynamoDB is empty
// ---------------------------------------------------------------------------
async function handleInit(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const body = JSON.parse(event.body ?? '{}');
  const { defaultPasswordHash } = body;

  // Check if users already exist
  const existing = await client.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: 'AUTH#GLOBAL', SK: 'AUTH#USERS' },
  }));

  if (existing.Item) {
    return ok({ seeded: false });
  }

  // Seed defaults
  const now = new Date().toISOString();
  await Promise.all([
    client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: 'AUTH#GLOBAL', SK: 'AUTH#USERS', dataJson: JSON.stringify(DEFAULT_USERS), updatedAt: now },
    })),
    client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: 'AUTH#GLOBAL', SK: 'AUTH#GROUPS', dataJson: JSON.stringify(DEFAULT_GROUPS), updatedAt: now },
    })),
    client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: 'AUTH#GLOBAL',
        SK: 'AUTH#PASSWORDS',
        dataJson: JSON.stringify({ admin: defaultPasswordHash }),
        updatedAt: now,
      },
    })),
  ]);

  return ok({ seeded: true });
}
