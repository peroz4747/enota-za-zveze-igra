// Netlify Function: /api/*  (rezultati, kontakti, mnenja, organizator)
import { getStore } from '@netlify/blobs';
import { handle } from '../../lib/core.mjs';

const env = k => (globalThis.Netlify && Netlify.env && Netlify.env.get(k)) || process.env[k] || '';

export default async (req) => handle(req, getStore({ name: 'enota-za-zveze', consistency: 'strong' }), env);

export const config = { path: '/api/*' };
