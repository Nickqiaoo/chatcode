import { nanoid } from 'nanoid';

interface Env {
  CHATCODE: KVNamespace;
  ASSETS: Fetcher;
  API_KEY: string;
}

interface StoredFile {
  content: string;
  filename: string;
  language?: string;
  createdAt: number;
}

interface FileUploadRequest {
  content: string;
  filename: string;
  language?: string;
  chatid: string;
}

interface DiffRequest {
  content: string;
  chatid: string;
}

function validateApiKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token === env.API_KEY;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (url.pathname === '/api/diff' && request.method === 'POST') {
      return handlePost(request, env, corsHeaders);
    }
    
    if (url.pathname.startsWith('/api/diff/') && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      if (id) {
        return handleGet(id, env, corsHeaders);
      }
    }

    // File API Routes
    if (url.pathname === '/api/file' && request.method === 'POST') {
      return handleFilePost(request, env, corsHeaders);
    }
    
    if (url.pathname.startsWith('/api/file/') && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      if (id) {
        return handleFileGet(id, env, corsHeaders);
      }
    }

    // File viewer page
    if (url.pathname === '/file' && request.method === 'GET') {
      try {
        const fileRequest = new Request(new URL('/file-viewer.html', request.url));
        const assetResponse = await env.ASSETS.fetch(fileRequest);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (error) {
        console.error('Error serving file viewer:', error);
      }
    }

    // Diff viewer page
    if (url.pathname === '/diff' && request.method === 'GET') {
      try {
        const diffRequest = new Request(new URL('/diff.html', request.url));
        const assetResponse = await env.ASSETS.fetch(diffRequest);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (error) {
        console.error('Error serving diff viewer:', error);
      }
    }

    // Static assets fallback
    if (request.method === 'GET') {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (error) {
        console.error('Error serving asset:', error);
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};

async function handlePost(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!validateApiKey(request, env)) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    
    const requestData = await request.json() as DiffRequest;
    const { content, chatid } = requestData;
    
    if (!content || !content.trim()) {
      return new Response('empty', { status: 400, headers: corsHeaders });
    }
    
    if (!chatid) {
      return new Response('Missing chatid', { status: 400, headers: corsHeaders });
    }
    
    const id = nanoid();
    const key = `diff:${chatid}_${id}`;

    await env.CHATCODE.put(key, content, {
      expirationTtl: 60 * 60, // Expires in 1 hour
    });

    return Response.json({ id: `${chatid}_${id}` }, { headers: corsHeaders });
  } catch (error) {
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
}

async function handleGet(id: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const text = await env.CHATCODE.get(`diff:${id}`, { type: 'text' });
    if (!text) {
      return new Response('not found', { status: 404, headers: corsHeaders });
    }

    return new Response(text, { 
      headers: { 
        ...corsHeaders,
        'content-type': 'text/plain' 
      } 
    });
  } catch (error) {
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
}

async function handleFilePost(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!validateApiKey(request, env)) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    
    const requestData = await request.json() as FileUploadRequest;
    const { content, filename, language, chatid } = requestData;
    
    if (!content || !filename) {
      return new Response('Missing content or filename', { status: 400, headers: corsHeaders });
    }
    
    if (!chatid) {
      return new Response('Missing chatid', { status: 400, headers: corsHeaders });
    }
    
    const id = nanoid();
    const key = `file:${chatid}_${id}`;
    const fileData: StoredFile = {
      content,
      filename,
      language,
      createdAt: Date.now()
    };

    await env.CHATCODE.put(key, JSON.stringify(fileData), {
      expirationTtl: 60 * 60, // Expires in 1 hour
    });

    return Response.json({ 
      id: `${chatid}_${id}`, 
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error in handleFilePost:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
}

async function handleFileGet(id: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const fileDataStr = await env.CHATCODE.get(`file:${id}`, { type: 'text' });
    if (!fileDataStr) {
      return new Response('File not found', { status: 404, headers: corsHeaders });
    }

    const fileData: StoredFile = JSON.parse(fileDataStr);
    
    return Response.json(fileData, { 
      headers: { 
        ...corsHeaders,
        'content-type': 'application/json' 
      } 
    });
  } catch (error) {
    console.error('Error in handleFileGet:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
}