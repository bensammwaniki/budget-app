const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { Buffer } = require('node:buffer');
const admin = require('firebase-admin');

const s3 = new S3Client({});

let firebaseInitialized = false;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS'
};

const respond = (statusCode, payload) => {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        },
        body: payload === undefined ? '' : JSON.stringify(payload)
    };
};

const parseServiceAccount = () => {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required');
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        parsed = JSON.parse(decoded);
    }

    if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
};

const initFirebase = () => {
    if (firebaseInitialized) return;
    if (admin.apps.length === 0) {
        const serviceAccount = parseServiceAccount();
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    firebaseInitialized = true;
};

const extractBearerToken = (headers = {}) => {
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string') return null;
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    return token;
};

const decodePathUid = (event) => {
    const uid = event?.pathParameters?.uid;
    if (!uid || typeof uid !== 'string') return null;
    return decodeURIComponent(uid);
};

const assertUidFormat = (uid) => {
    return /^[A-Za-z0-9:_-]{3,128}$/.test(uid);
};

const getBackupBucket = () => {
    const bucket = process.env.BACKUP_BUCKET_NAME;
    if (!bucket) throw new Error('BACKUP_BUCKET_NAME is required');
    return bucket;
};

const buildObjectKey = (uid) => {
    const rawPrefix = process.env.BACKUP_KEY_PREFIX || 'backups';
    const prefix = rawPrefix.replace(/^\/+|\/+$/g, '');
    if (!prefix) return `${uid}.json`;
    return `${prefix}/${uid}.json`;
};

const parseRequestBody = (event) => {
    if (!event.body) {
        throw new Error('Missing request body');
    }

    const decodedBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;

    if (Buffer.byteLength(decodedBody, 'utf8') > 8 * 1024 * 1024) {
        const error = new Error('Backup payload too large');
        error.name = 'PayloadTooLarge';
        throw error;
    }

    const parsed = JSON.parse(decodedBody);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON payload');
    }
    if (!parsed.tables || typeof parsed.tables !== 'object') {
        throw new Error('Payload must include tables');
    }
    return parsed;
};

const verifyUser = async (event, requestedUid) => {
    initFirebase();

    const token = extractBearerToken(event.headers);
    if (!token) {
        return { ok: false, status: 401, error: 'Missing bearer token' };
    }

    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.uid !== requestedUid) {
        return { ok: false, status: 403, error: 'Token user mismatch' };
    }

    return { ok: true };
};

const handleGetBackup = async (uid) => {
    const bucket = getBackupBucket();
    const key = buildObjectKey(uid);

    try {
        const result = await s3.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key
        }));

        const text = await result.Body.transformToString('utf8');
        if (!text) return respond(204);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
            body: text
        };
    } catch (error) {
        const notFound = error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;
        if (notFound) {
            return respond(404, { error: 'Backup not found' });
        }
        throw error;
    }
};

const handlePutBackup = async (uid, event) => {
    const bucket = getBackupBucket();
    const key = buildObjectKey(uid);
    const payload = parseRequestBody(event);

    const now = new Date().toISOString();
    const normalized = {
        schemaVersion: Number(payload.schemaVersion || 1),
        exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : now,
        userId: uid,
        devicePlatform: typeof payload.devicePlatform === 'string' ? payload.devicePlatform : 'unknown',
        tables: payload.tables
    };
    const body = JSON.stringify(normalized);

    const putResult = await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
        Metadata: {
            uid,
            exportedat: normalized.exportedAt,
            schemaversion: String(normalized.schemaVersion)
        }
    }));

    return respond(200, {
        ok: true,
        bucket,
        key,
        etag: putResult.ETag || null,
        uploadedAt: now
    });
};

exports.handler = async (event) => {
    try {
        const method = (event?.requestContext?.http?.method || event?.httpMethod || '').toUpperCase();
        if (method === 'OPTIONS') {
            return respond(204);
        }

        const uid = decodePathUid(event);
        if (!uid || !assertUidFormat(uid)) {
            return respond(400, { error: 'Invalid uid path parameter' });
        }

        const auth = await verifyUser(event, uid);
        if (!auth.ok) {
            return respond(auth.status, { error: auth.error });
        }

        if (method === 'GET') {
            return await handleGetBackup(uid);
        }

        if (method === 'PUT') {
            return await handlePutBackup(uid, event);
        }

        return respond(405, { error: `Method ${method} not allowed` });
    } catch (error) {
        if (error?.name === 'PayloadTooLarge') {
            return respond(413, { error: error.message });
        }
        if (error?.errorInfo?.code === 'auth/argument-error' || error?.code === 'auth/argument-error') {
            return respond(401, { error: 'Invalid bearer token' });
        }
        if (error?.errorInfo?.code === 'auth/id-token-expired' || error?.code === 'auth/id-token-expired') {
            return respond(401, { error: 'Expired bearer token' });
        }
        if (error instanceof SyntaxError) {
            return respond(400, { error: 'Invalid JSON payload' });
        }

        console.error('Backup API error:', error);
        return respond(500, { error: 'Internal server error' });
    }
};
